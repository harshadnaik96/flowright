import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { selectorHealings, flowSteps, flows } from "../db/schema";
import { and, eq, desc } from "drizzle-orm";
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
