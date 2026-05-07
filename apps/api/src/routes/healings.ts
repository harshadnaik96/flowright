import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { selectorHealings, healTelemetry, flowSteps, flows } from "../db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import type { HealingStatus } from "@flowright/shared";

export async function healingRoutes(app: FastifyInstance) {
  // List healings — optionally filter by projectId / flowId / status
  app.get<{
    Querystring: { projectId?: string; flowId?: string; status?: HealingStatus };
  }>("/", async (req) => {
    const { projectId, flowId, status } = req.query;

    const rows = await db
      .select({
        healing: selectorHealings,
        step: { plainEnglish: flowSteps.plainEnglish, order: flowSteps.order },
        flow: { name: flows.name, projectId: flows.projectId },
      })
      .from(selectorHealings)
      .innerJoin(flowSteps, eq(flowSteps.id, selectorHealings.stepId))
      .innerJoin(flows, eq(flows.id, selectorHealings.flowId))
      .where(
        and(
          status ? eq(selectorHealings.status, status) : undefined,
          flowId ? eq(selectorHealings.flowId, flowId) : undefined,
          projectId ? eq(flows.projectId, projectId) : undefined,
        ),
      )
      .orderBy(desc(selectorHealings.healedAt));

    return rows.map((r) => ({
      ...r.healing,
      stepPlainEnglish: r.step.plainEnglish,
      stepOrder: r.step.order,
      flowName: r.flow.name,
      projectId: r.flow.projectId,
    }));
  });

  // Accept a healing → optionally apply healedCommand to flowSteps.command
  app.post<{ Params: { id: string }; Body: { applyToFlow?: boolean } }>(
    "/:id/accept",
    async (req, reply) => {
      const { id } = req.params;
      const applyToFlow = req.body?.applyToFlow ?? true;

      const [healing] = await db
        .select()
        .from(selectorHealings)
        .where(eq(selectorHealings.id, id));
      if (!healing) return reply.status(404).send({ error: "Healing not found" });
      if (healing.status !== "pending")
        return reply.status(400).send({ error: `Healing already ${healing.status}` });

      if (applyToFlow) {
        await db
          .update(flowSteps)
          .set({ command: healing.healedCommand, selectorUsed: healing.healedSelector ?? null })
          .where(eq(flowSteps.id, healing.stepId));
      }

      await db
        .update(selectorHealings)
        .set({ status: "accepted", reviewedAt: new Date() })
        .where(eq(selectorHealings.id, id));

      return { id, status: "accepted", appliedToFlow: applyToFlow };
    },
  );

  // Heal telemetry — list raw heal attempts for measurement / debugging.
  app.get<{ Querystring: { projectId?: string; flowId?: string; limit?: string } }>(
    "/telemetry",
    async (req) => {
      const { projectId, flowId } = req.query;
      const limit = Math.min(Number(req.query.limit) || 200, 1000);

      const rows = await db
        .select({
          telemetry: healTelemetry,
          step: { plainEnglish: flowSteps.plainEnglish, order: flowSteps.order },
          flow: { name: flows.name, projectId: flows.projectId },
        })
        .from(healTelemetry)
        .innerJoin(flowSteps, eq(flowSteps.id, healTelemetry.stepId))
        .innerJoin(flows, eq(flows.id, healTelemetry.flowId))
        .where(
          and(
            flowId ? eq(healTelemetry.flowId, flowId) : undefined,
            projectId ? eq(flows.projectId, projectId) : undefined,
          ),
        )
        .orderBy(desc(healTelemetry.createdAt))
        .limit(limit);

      return rows.map((r) => ({
        ...r.telemetry,
        stepPlainEnglish: r.step.plainEnglish,
        stepOrder: r.step.order,
        flowName: r.flow.name,
        projectId: r.flow.projectId,
      }));
    },
  );

  // Aggregate heal-quality stats — total / recovered / no_proposal / failed,
  // mean latencies, rejection-reason breakdown. Read-mostly view; safe to
  // poll from a dashboard.
  app.get<{ Querystring: { projectId?: string; flowId?: string } }>(
    "/telemetry/summary",
    async (req) => {
      const { projectId, flowId } = req.query;

      const [agg] = await db
        .select({
          total: sql<number>`count(*)::int`,
          recovered: sql<number>`sum(case when ${healTelemetry.outcome} = 'recovered' then 1 else 0 end)::int`,
          noProposal: sql<number>`sum(case when ${healTelemetry.outcome} = 'no_proposal' then 1 else 0 end)::int`,
          failedAfterHeal: sql<number>`sum(case when ${healTelemetry.outcome} = 'failed_after_heal' then 1 else 0 end)::int`,
          avgProposalMs: sql<number>`coalesce(avg(${healTelemetry.proposalLatencyMs}), 0)::int`,
          avgExtractMs: sql<number>`coalesce(avg(${healTelemetry.liveExtractMs}), 0)::int`,
          avgElements: sql<number>`coalesce(avg(${healTelemetry.elementsExtracted}), 0)::int`,
        })
        .from(healTelemetry)
        .innerJoin(flows, eq(flows.id, healTelemetry.flowId))
        .where(
          and(
            flowId ? eq(healTelemetry.flowId, flowId) : undefined,
            projectId ? eq(flows.projectId, projectId) : undefined,
          ),
        );

      const reasonBreakdown = await db
        .select({
          reason: healTelemetry.rejectedReason,
          count: sql<number>`count(*)::int`,
        })
        .from(healTelemetry)
        .innerJoin(flows, eq(flows.id, healTelemetry.flowId))
        .where(
          and(
            flowId ? eq(healTelemetry.flowId, flowId) : undefined,
            projectId ? eq(flows.projectId, projectId) : undefined,
            sql`${healTelemetry.rejectedReason} is not null`,
          ),
        )
        .groupBy(healTelemetry.rejectedReason);

      return {
        ...agg,
        rejectionReasons: reasonBreakdown.reduce<Record<string, number>>((acc, r) => {
          if (r.reason) acc[r.reason] = r.count;
          return acc;
        }, {}),
      };
    },
  );

  // Reject a healing
  app.post<{ Params: { id: string } }>("/:id/reject", async (req, reply) => {
    const { id } = req.params;

    const [healing] = await db
      .select()
      .from(selectorHealings)
      .where(eq(selectorHealings.id, id));
    if (!healing) return reply.status(404).send({ error: "Healing not found" });
    if (healing.status !== "pending")
      return reply.status(400).send({ error: `Healing already ${healing.status}` });

    await db
      .update(selectorHealings)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(eq(selectorHealings.id, id));

    return { id, status: "rejected" };
  });
}
