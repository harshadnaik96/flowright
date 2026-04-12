import type { WebSocket } from "@fastify/websocket";
import { createHash } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { db } from "../db/client";
import { agentTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { broadcast } from "./ws-broadcast";
import { db as _db } from "../db/client";
import { testRuns, stepResults, flowSteps } from "../db/schema";
import type { RunStatus } from "@flowright/shared";

const RUNS_BASE = process.env.SCREENSHOT_DIR ?? "/tmp/flowright-runs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentJob {
  runId: string;
  flowYaml: string;
  envVars: Record<string, string>;
  stepOrders: number[];   // DB order values for each user step (auth subflow excluded)
  authStepCount: number;  // number of Maestro stdout lines produced by the auth subflow preamble
}

interface AgentConnection {
  ws: WebSocket;
  tokenId: string;
  name: string;
  connectedAt: Date;
}

// ─── In-memory registry ───────────────────────────────────────────────────────

const connections = new Map<string, AgentConnection>(); // tokenId → connection

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const agentRegistry = {
  // Called when an agent WebSocket connects
  async register(ws: WebSocket, plainToken: string): Promise<boolean> {
    const tokenHash = hashToken(plainToken);
    const [record] = await db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.tokenHash, tokenHash));

    if (!record) return false;

    // Close existing connection for this token if any
    agentRegistry.disconnect(record.id);

    connections.set(record.id, { ws, tokenId: record.id, name: record.name, connectedAt: new Date() });

    // Update last connected timestamp
    await db
      .update(agentTokens)
      .set({ lastConnectedAt: new Date() })
      .where(eq(agentTokens.id, record.id));

    // Handle messages from the agent (step results)
    ws.on("message", (raw: Buffer | string) => {
      handleAgentMessage(raw.toString()).catch((err) => {
        console.error("[agent-registry] message handler error:", err);
      });
    });

    ws.on("close", () => {
      connections.delete(record.id);
      console.info(`[agent-registry] agent disconnected: ${record.name}`);
    });

    console.info(`[agent-registry] agent connected: ${record.name}`);
    return true;
  },

  isOnline(tokenId: string): boolean {
    return connections.has(tokenId);
  },

  // Find the first online agent — single-agent-per-tester model
  getAnyOnline(): AgentConnection | undefined {
    return connections.values().next().value;
  },

  // Get a specific agent by tokenId
  get(tokenId: string): AgentConnection | undefined {
    return connections.get(tokenId);
  },

  // List all connected agents
  getAll(): Array<{ tokenId: string; name: string; connectedAt: Date }> {
    return Array.from(connections.values()).map(({ tokenId, name, connectedAt }) => ({
      tokenId,
      name,
      connectedAt,
    }));
  },

  sendJob(tokenId: string, job: AgentJob): boolean {
    const conn = connections.get(tokenId);
    if (!conn) return false;
    conn.ws.send(JSON.stringify({ type: "run:job", ...job }));
    return true;
  },

  disconnect(tokenId: string): void {
    const conn = connections.get(tokenId);
    if (conn) {
      try { conn.ws.close(); } catch { /* ignore */ }
      connections.delete(tokenId);
    }
  },
};

// ─── Agent message handler ────────────────────────────────────────────────────
// Receives step result events from the agent, saves to DB, broadcasts to browser.

async function handleAgentMessage(raw: string): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  const runId = msg.runId as string;
  if (!runId) return;

  if (msg.type === "step:passed" || msg.type === "step:failed") {
    const stepOrder = msg.stepOrder as number;
    const errorMessage = (msg.errorMessage as string | undefined) ?? null;
    const screenshotData = msg.screenshotData as string | undefined;
    const status = msg.type === "step:passed" ? "passed" : "failed";

    // Load the step to get its id and plainEnglish
    const [run] = await _db.select().from(testRuns).where(eq(testRuns.id, runId));
    if (!run) return;

    const steps = await _db
      .select()
      .from(flowSteps)
      .where(eq(flowSteps.flowId, run.flowId));

    const step = steps.find((s) => s.order === stepOrder);
    if (!step) return;

    // Save screenshot to disk if the agent sent one (only for failed steps)
    let screenshotPath: string | null = null;
    if (screenshotData) {
      try {
        const runDir = join(RUNS_BASE, runId);
        await mkdir(runDir, { recursive: true });
        const filename = `step-${stepOrder}.png`;
        await writeFile(join(runDir, filename), Buffer.from(screenshotData, "base64"));
        screenshotPath = `${runId}/${filename}`;
      } catch (err) {
        console.error("[agent-registry] Failed to save screenshot:", err);
      }
    }

    await _db.insert(stepResults).values({
      runId,
      stepId: step.id,
      order: step.order,
      plainEnglish: step.plainEnglish,
      status,
      screenshotPath,
      errorMessage: errorMessage ?? undefined,
      warningMessage: null,
      durationMs: null,
    });

    broadcast(runId, {
      type: msg.type,
      runId,
      payload: {
        stepOrder,
        plainEnglish: step.plainEnglish,
        errorMessage: errorMessage ?? undefined,
        screenshotPath: screenshotPath ?? undefined,
      },
    });
  }

  if (msg.type === "run:completed") {
    const status = msg.status as RunStatus;
    const errorMessage = msg.errorMessage as string | undefined;
    await _db
      .update(testRuns)
      .set({ status, completedAt: new Date() })
      .where(eq(testRuns.id, runId));

    broadcast(runId, { type: "run:completed", runId, payload: { status, errorMessage } });
  }

  if (msg.type === "run:error") {
    const errorMessage = msg.errorMessage as string;
    await _db
      .update(testRuns)
      .set({ status: "error", completedAt: new Date() })
      .where(eq(testRuns.id, runId));

    broadcast(runId, { type: "run:error", runId, payload: { errorMessage } });
  }
}
