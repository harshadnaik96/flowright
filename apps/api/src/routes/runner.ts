import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { testRuns, stepResults, flows } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { startRun, addRunListener, readScreenshot } from "../services/runner";
import type { FlowVariable } from "@flowright/shared";

export async function runnerRoutes(app: FastifyInstance) {

  // ── Start a run ─────────────────────────────────────────────────────────────
  // Creates a TestRun record and kicks off async execution.
  // Returns immediately with runId so the client can connect to WebSocket.

  app.post<{
    Body: {
      flowId: string;
      environmentId: string;
      runtimeVariables: Record<string, string>;
    };
  }>("/", async (req, reply) => {
    const { flowId, environmentId, runtimeVariables = {} } = req.body;

    if (!flowId) return reply.status(400).send({ error: "flowId is required" });
    if (!environmentId) return reply.status(400).send({ error: "environmentId is required" });

    // Only approved flows can run
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) return reply.status(404).send({ error: "Flow not found" });
    if (flow.status !== "approved")
      return reply.status(400).send({ error: "Only approved flows can be run" });

    const [run] = await db
      .insert(testRuns)
      .values({ flowId, environmentId, runtimeVariables, status: "pending" })
      .returning();

    // Fire-and-forget — client connects to WS to receive progress
    startRun(run.id).catch((err) => {
      app.log.error({ err, runId: run.id }, "startRun threw unexpectedly");
    });

    return reply.status(201).send({ runId: run.id });
  });

  // ── List runs for a flow ──────────────────────────────────────────────────

  app.get<{ Querystring: { flowId: string } }>("/", async (req, reply) => {
    const { flowId } = req.query;
    if (!flowId) return reply.status(400).send({ error: "flowId is required" });

    return db
      .select()
      .from(testRuns)
      .where(eq(testRuns.flowId, flowId))
      .orderBy(desc(testRuns.startedAt));
  });

  // ── Get run with step results ─────────────────────────────────────────────

  app.get<{ Params: { runId: string } }>("/:runId", async (req, reply) => {
    const [run] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, req.params.runId));

    if (!run) return reply.status(404).send({ error: "Run not found" });

    const results = await db
      .select()
      .from(stepResults)
      .where(eq(stepResults.runId, run.id))
      .orderBy(stepResults.order);

    return { ...run, stepResults: results };
  });

  // ── WebSocket — live run progress ─────────────────────────────────────────
  // Client connects before or during a run to receive WsEvent messages.

  app.get<{ Params: { runId: string } }>(
    "/ws/:runId",
    { websocket: true },
    (socket, req) => {
      addRunListener(req.params.runId, socket);
    }
  );

  // ── Serve screenshots ─────────────────────────────────────────────────────

  app.get<{ Params: { runId: string; filename: string } }>(
    "/screenshots/:runId/:filename",
    async (req, reply) => {
      try {
        const data = await readScreenshot(req.params.runId, req.params.filename);
        return reply.type("image/png").send(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Not found";
        return reply.status(404).send({ error: msg });
      }
    }
  );
}
