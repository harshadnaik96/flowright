import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { testRuns, stepResults, flows, environments, projects, flowSteps } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { startRun, readScreenshot } from "../services/runner";
import { addRunListener } from "../services/ws-broadcast";
import { agentRegistry } from "../services/agent-registry";
import { decryptAuth } from "../services/encryption";
import { buildFlowYamlForAgent, estimateSubflowStepCount } from "../services/runner-maestro";
import type { FlowVariable, EnvironmentAuth } from "@flowright/shared";

export async function runnerRoutes(app: FastifyInstance) {

  // ── Start a run ─────────────────────────────────────────────────────────────
  // Creates a TestRun record and kicks off async execution.
  // Returns immediately with runId so the client can connect to WebSocket.

  // ── List connected agents ─────────────────────────────────────────────────
  app.get("/agents", async () => {
    return agentRegistry.getAll();
  });

  app.post<{
    Body: {
      flowId: string;
      environmentId: string;
      runtimeVariables: Record<string, string>;
      agentId?: string;
    };
  }>("/", async (req, reply) => {
    const { flowId, environmentId, runtimeVariables = {}, agentId } = req.body;

    if (!flowId) return reply.status(400).send({ error: "flowId is required" });
    if (!environmentId) return reply.status(400).send({ error: "environmentId is required" });

    // Only approved flows can run
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) return reply.status(404).send({ error: "Flow not found" });
    if (flow.status !== "approved")
      return reply.status(400).send({ error: "Only approved flows can be run" });

    // Look up project platform via environment → project join
    const [envRow] = await db
      .select({ platform: projects.platform })
      .from(environments)
      .innerJoin(projects, eq(environments.projectId, projects.id))
      .where(eq(environments.id, environmentId));

    if (!envRow) return reply.status(404).send({ error: "Environment not found" });

    const [run] = await db
      .insert(testRuns)
      .values({ flowId, environmentId, runtimeVariables, status: "pending" })
      .returning();

    const isMobile = envRow.platform === "android" || envRow.platform === "ios";

    if (isMobile) {
      // Mobile runs execute on the tester's local agent
      const agent = agentId ? agentRegistry.get(agentId) : agentRegistry.getAnyOnline();
      if (!agent) {
        await db.delete(testRuns).where(eq(testRuns.id, run.id));
        return reply.status(409).send({
          error: agentId
            ? "Selected agent is not connected."
            : "Agent not connected. Open the Flowright agent on your laptop.",
        });
      }

      // Build the flow YAML and env vars, then send the job to the agent
      const [env] = await db.select().from(environments).where(eq(environments.id, environmentId));
      const steps = await db
        .select()
        .from(flowSteps)
        .where(eq(flowSteps.flowId, flowId))
        .orderBy(flowSteps.order);

      const auth = decryptAuth(env.auth as EnvironmentAuth);
      const flowYaml = buildFlowYamlForAgent(env.baseUrl, steps.map((s) => s.command), env.authSubflowPath);

      const envVars: Record<string, string> = {};
      if (auth.phoneNumber) envVars["PHONE_NUMBER"] = auth.phoneNumber;
      if (auth.otp)         envVars["OTP"]          = auth.otp;
      if (auth.mpin)        envVars["MPIN"]         = auth.mpin;
      if (auth.email)       envVars["EMAIL"]        = auth.email;
      if (auth.password)    envVars["PASSWORD"]     = auth.password;
      Object.assign(envVars, runtimeVariables);

      await db.update(testRuns).set({ status: "running" }).where(eq(testRuns.id, run.id));

      const stepOrders = steps.map((s) => s.order);
      const authStepCount = estimateSubflowStepCount(auth);
      agentRegistry.sendJob(agent.tokenId, { runId: run.id, flowYaml, envVars, stepOrders, authStepCount });
    } else {
      // Web runs execute directly on the server
      startRun(run.id).catch((err) => {
        app.log.error({ err, runId: run.id }, "startRun threw unexpectedly");
      });
    }

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
