import WebSocket from "ws";
import { runJob, type AgentJob } from "./run-job";

export interface ConnectOptions {
  serverUrl: string; // e.g. "https://app.flowright.io" or "http://localhost:3001"
  token: string;
}

const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

export function startAgent(opts: ConnectOptions): void {
  let backoff = MIN_BACKOFF_MS;
  let activeJob = false;

  function connect(): void {
    // Convert http(s) → ws(s) and append the auth token
    const wsUrl =
      opts.serverUrl
        .replace(/^https:/, "wss:")
        .replace(/^http:/, "ws:")
        .replace(/\/$/, "") +
      `/agent/ws?token=${encodeURIComponent(opts.token)}`;

    console.log(`[flowright-agent] Connecting to ${opts.serverUrl}...`);
    const ws = new WebSocket(wsUrl);

    ws.on("open", () => {
      backoff = MIN_BACKOFF_MS; // reset on successful connect
      console.log("[flowright-agent] Connected. Waiting for jobs...");
    });

    ws.on("message", (data: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "run:job") {
        if (activeJob) {
          console.warn("[flowright-agent] Received job while busy — ignoring (one job at a time)");
          return;
        }
        const job = msg as unknown as AgentJob & { type: string };
        console.log(`[flowright-agent] Starting run ${job.runId}`);
        activeJob = true;
        runJob(ws, job)
          .then(() => console.log(`[flowright-agent] Run ${job.runId} finished`))
          .catch((err) => console.error(`[flowright-agent] Run ${job.runId} error:`, err))
          .finally(() => { activeJob = false; });
      }
    });

    ws.on("close", (code, reason) => {
      const reasonStr = reason?.toString() || "";
      if (code === 1008) {
        // Policy violation — bad token, don't reconnect
        console.error(`[flowright-agent] Server rejected connection: ${reasonStr}`);
        console.error("[flowright-agent] Check your --token and --server values.");
        process.exit(1);
      }
      console.log(
        `[flowright-agent] Disconnected (code ${code}). Reconnecting in ${backoff / 1000}s...`
      );
      setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        connect();
      }, backoff);
    });

    ws.on("error", (err) => {
      // The close event will fire after this and trigger reconnect
      console.error(`[flowright-agent] Connection error: ${err.message}`);
    });
  }

  connect();
}
