import { spawn } from "child_process";
import type { MobileSelectorEntry } from "@flowright/shared";

// ─── Maestro hierarchy node shape ─────────────────────────────────────────────
// `maestro hierarchy` outputs a JSON tree. Field names reflect UIAutomator2
// (Android) and XCTest (iOS) attributes surfaced by Maestro's unified model.

interface HierarchyNode {
  text?: string;
  hintText?: string;
  accessibilityText?: string;    // contentDescription on Android, accessibilityLabel on iOS
  resourceId?: string;           // e.g. "com.example.app:id/login_button"
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  checked?: boolean;
  bounds?: HierarchyBounds | string; // Maestro may return object or "[x1,y1][x2,y2]" string
  children?: HierarchyNode[];
}

interface HierarchyBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────

function runMaestroCommand(args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("maestro", args, { env: process.env });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`maestro ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`maestro ${args[0]} exited with code ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn maestro: ${err.message}. Is Maestro CLI installed and on PATH?`));
    });
  });
}

// ─── Bounds normalisation ─────────────────────────────────────────────────────

function normaliseBounds(bounds: HierarchyNode["bounds"]): string | undefined {
  if (!bounds) return undefined;
  if (typeof bounds === "string") return bounds;
  const { x, y, width, height } = bounds;
  return `[${x},${y}][${x + width},${y + height}]`;
}

// ─── Tree traversal ───────────────────────────────────────────────────────────
// Recursively walk the hierarchy tree and collect elements that have at least
// one stable identifier (text, accessibilityId, or resourceId) and are either
// clickable or enabled (i.e. interactive or labelled).

function extractNodes(node: HierarchyNode, results: MobileSelectorEntry[]): void {
  const text        = node.text?.trim() || node.hintText?.trim() || undefined;
  const accessibilityId = node.accessibilityText?.trim() || undefined;
  const resourceId  = node.resourceId?.trim() || undefined;
  const bounds      = normaliseBounds(node.bounds);

  const hasIdentifier = text || accessibilityId || resourceId;
  const isInteractive = node.clickable === true || node.enabled !== false;

  if (hasIdentifier && isInteractive) {
    // Prefer accessibilityId as the label; fall back to text then resourceId.
    const label = accessibilityId || text || resourceId!;
    results.push({
      label,
      ...(text           && { text }),
      ...(accessibilityId && { accessibilityId }),
      ...(resourceId     && { resourceId }),
      ...(bounds         && { bounds }),
    });
  }

  for (const child of node.children ?? []) {
    extractNodes(child, results);
  }
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
// `maestro hierarchy` may prefix stdout with log lines before the JSON tree.
// Scan forward to the first `{` to locate the payload.

function parseHierarchyOutput(raw: string): HierarchyNode {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(
      `maestro hierarchy output contained no JSON. First 300 chars: ${raw.slice(0, 300)}`
    );
  }
  return JSON.parse(raw.slice(jsonStart)) as HierarchyNode;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MobileCrawlResult {
  entries: MobileSelectorEntry[];
  crawledAt: string;
}

export async function crawlMobileApp(appId: string): Promise<MobileCrawlResult> {
  // 1. Bring the app to the foreground so the hierarchy reflects its current state.
  //    Best-effort — if launch fails (app already foreground, device quirk, etc.)
  //    we still attempt the hierarchy capture.
  try {
    await runMaestroCommand(["launch", appId], 20_000);
    // Give the app a moment to settle after launch.
    await new Promise((r) => setTimeout(r, 1_500));
  } catch (err) {
    console.warn(`[crawler-maestro] Could not launch ${appId} — proceeding with hierarchy capture anyway:`, err);
  }

  // 2. Capture the accessibility tree.
  const raw = await runMaestroCommand(["hierarchy"], 30_000);

  // 3. Parse.
  const root = parseHierarchyOutput(raw);

  // 4. Extract all useful nodes.
  const all: MobileSelectorEntry[] = [];
  extractNodes(root, all);

  // 5. Deduplicate: same (text, accessibilityId, resourceId) triple.
  const seen = new Set<string>();
  const entries = all.filter((e) => {
    const key = `${e.text ?? ""}|${e.accessibilityId ?? ""}|${e.resourceId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.info(`[crawler-maestro] captured ${entries.length} elements from ${appId}`);

  return {
    entries,
    crawledAt: new Date().toISOString(),
  };
}
