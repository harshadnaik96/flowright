import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { flows, flowSteps, testRuns } from "../db/schema";
import { eq, and } from "drizzle-orm";
import type { BulkUpdateStepsRequest } from "@flowright/shared";

export async function flowRoutes(app: FastifyInstance) {
  // List flows for a project
  app.get<{ Querystring: { projectId: string } }>("/", async (req, reply) => {
    const { projectId } = req.query;
    if (!projectId) return reply.status(400).send({ error: "projectId is required" });

    return db
      .select()
      .from(flows)
      .where(eq(flows.projectId, projectId))
      .orderBy(flows.createdAt);
  });

  // Get flow with steps
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const [flow] = await db
      .select()
      .from(flows)
      .where(eq(flows.id, req.params.id));

    if (!flow) return reply.status(404).send({ error: "Flow not found" });

    const steps = await db
      .select()
      .from(flowSteps)
      .where(eq(flowSteps.flowId, flow.id))
      .orderBy(flowSteps.order);

    return { ...flow, steps };
  });

  // Delete a flow — clears runs (cascades to stepResults) then the flow itself
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { id: flowId } = req.params;

    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) return reply.status(404).send({ error: "Flow not found" });

    // Delete runs first so stepResults cascade before flowSteps FK is touched
    await db.delete(testRuns).where(eq(testRuns.flowId, flowId));
    await db.delete(flowSteps).where(eq(flowSteps.flowId, flowId));
    await db.delete(flows).where(eq(flows.id, flowId));

    return reply.status(204).send();
  });

  // Bulk update all steps' commands — used by the bulk editor
  app.patch<{
    Params: { flowId: string };
    Body: BulkUpdateStepsRequest;
  }>("/:flowId/steps", async (req, reply) => {
    const { flowId } = req.params;
    const { steps } = req.body;

    if (!Array.isArray(steps) || steps.length === 0) {
      return reply.status(400).send({ error: "steps array is required" });
    }

    for (const s of steps) {
      if (!s.command?.trim()) {
        return reply.status(400).send({ error: `Step ${s.id} has an empty command` });
      }
    }

    await db.transaction(async (tx) => {
      for (const s of steps) {
        await tx
          .update(flowSteps)
          .set({
            command: s.command.trim(),
            ...(s.selectorUsed !== undefined ? { selectorUsed: s.selectorUsed ?? null } : {}),
          })
          .where(and(eq(flowSteps.id, s.id), eq(flowSteps.flowId, flowId)));
      }
    });

    return { updated: steps.length };
  });

  // Patch a single step's command — used to fix a selector after a failed run
  app.patch<{
    Params: { flowId: string; stepId: string };
    Body: { command: string; selectorUsed?: string | null };
  }>("/:flowId/steps/:stepId", async (req, reply) => {
    const { flowId, stepId } = req.params;
    const { command, selectorUsed } = req.body;

    if (!command?.trim()) {
      return reply.status(400).send({ error: "command is required" });
    }

    const [updated] = await db
      .update(flowSteps)
      .set({
        command: command.trim(),
        ...(selectorUsed !== undefined ? { selectorUsed: selectorUsed ?? null } : {}),
      })
      .where(and(eq(flowSteps.id, stepId), eq(flowSteps.flowId, flowId)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Step not found" });

    return { step: updated };
  });
}
