import type { WsEvent } from "@flowright/shared";

// ─── WebSocket broadcast registry ─────────────────────────────────────────────
// Shared by both the Playwright web runner and the Maestro mobile runner.

export interface WsClient {
  send: (data: string) => void;
  readyState: number;
  on: (event: string, handler: () => void) => void;
}

const runListeners = new Map<string, Set<WsClient>>();

export function addRunListener(runId: string, ws: WsClient): void {
  if (!runListeners.has(runId)) runListeners.set(runId, new Set());
  runListeners.get(runId)!.add(ws);
  ws.on("close", () => runListeners.get(runId)?.delete(ws));
}

export function broadcast(runId: string, event: WsEvent): void {
  const listeners = runListeners.get(runId);
  if (!listeners) return;
  const payload = JSON.stringify(event);
  for (const ws of listeners) {
    if (ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(payload);
      } catch {
        // ignore send errors on closed sockets
      }
    }
  }
}
