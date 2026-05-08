import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { MobileSelectorEntry } from "@flowright/shared";

// ─── Maestro hierarchy node shape ─────────────────────────────────────────────
// `maestro hierarchy` outputs a JSON tree. Field names reflect UIAutomator2
// (Android) and XCTest (iOS) attributes surfaced by Maestro's unified model.

interface HierarchyNode {
  // Native Android / iOS fields
  text?: string;
  hintText?: string;
  accessibilityText?: string;    // contentDescription on Android, accessibilityLabel on iOS
  resourceId?: string;           // e.g. "com.example.app:id/login_button"
  clickable?: boolean;
  enabled?: boolean;
  focused?: boolean;
  checked?: boolean;
  bounds?: HierarchyBounds | string;
  // Flutter-specific fields (Maestro Flutter driver)
  label?: string;                // Semantics.label
  value?: string;                // Semantics.value
  hint?: string;                 // Semantics.hint
  identifier?: string;           // Semantics.identifier / testTag
  semanticsLabel?: string;
  title?: string;
  // Some versions wrap everything under attributes
  attributes?: Record<string, string | boolean | number>;
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

function extractNodes(node: HierarchyNode, results: MobileSelectorEntry[], screen: string): void {
  // Collect text from all known field names (native Android, iOS, Flutter)
  const text =
    node.text?.trim() ||
    node.label?.trim() ||
    node.value?.trim() ||
    node.title?.trim() ||
    node.semanticsLabel?.trim() ||
    (node.attributes?.text as string | undefined)?.trim() ||
    node.hintText?.trim() ||
    node.hint?.trim() ||
    undefined;

  const accessibilityId =
    node.accessibilityText?.trim() ||
    node.identifier?.trim() ||
    (node.attributes?.["content-desc"] as string | undefined)?.trim() ||
    undefined;

  const resourceId =
    node.resourceId?.trim() ||
    (node.attributes?.["resource-id"] as string | undefined)?.trim() ||
    undefined;

  const bounds = normaliseBounds(node.bounds);

  const hasIdentifier = !!(text || accessibilityId || resourceId);

  // Be permissive: include anything with a stable identifier.
  // For Flutter apps without Semantics, most nodes lack explicit clickable/enabled flags.
  if (hasIdentifier) {
    const label = accessibilityId || text || resourceId!;
    results.push({
      label,
      ...(text            && { text }),
      ...(accessibilityId && { accessibilityId }),
      ...(resourceId      && { resourceId }),
      ...(bounds          && { bounds }),
      screen,
    });
  }

  for (const child of node.children ?? []) {
    extractNodes(child, results, screen);
  }
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function parseHierarchyOutput(raw: string): HierarchyNode {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(
      `maestro hierarchy output contained no JSON. First 300 chars: ${raw.slice(0, 300)}`
    );
  }
  const parsed = JSON.parse(raw.slice(jsonStart)) as HierarchyNode;

  // Debug: log the raw top-level shape so we can see what fields Flutter actually exposes.
  // Remove this once the field mapping is confirmed.
  console.info("[crawler-maestro] hierarchy top-level keys:", Object.keys(parsed));
  if (parsed.children?.length) {
    console.info("[crawler-maestro] first child keys:", Object.keys(parsed.children[0]));
    console.info("[crawler-maestro] first child sample:", JSON.stringify(parsed.children[0], null, 2).slice(0, 500));
  }

  return parsed;
}

// ─── Temp flow helpers ────────────────────────────────────────────────────────
// Maestro has no CLI command for a single tap — we write a minimal flow file
// and run `maestro test <file>` to perform navigation during the crawl.

function writeTempFlow(appId: string, commands: string[]): string {
  const tmpFile = path.join(os.tmpdir(), `flowright-crawl-${Date.now()}.yaml`);
  const content = [`appId: ${appId}`, "---", ...commands].join("\n");
  fs.writeFileSync(tmpFile, content, "utf8");
  return tmpFile;
}

function cleanupTempFlow(filePath: string): void {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

// ─── Navigation element detection ────────────────────────────────────────────
// Identifies bottom-tab / drawer items that are worth tapping to reach new screens.

const NAV_KEYWORDS = [
  "home", "dashboard", "payment", "payments", "transfer", "transfers",
  "history", "profile", "settings", "account", "accounts",
  "wallet", "menu", "transaction", "transactions",
  "send", "receive", "card", "cards", "more", "explore",
  "activity", "rewards", "offers", "help", "support",
];

function isNavElement(entry: MobileSelectorEntry): boolean {
  const label = (entry.text || entry.accessibilityId || "").toLowerCase().trim();
  if (!label || label.length > 30) return false; // nav labels are short
  return NAV_KEYWORDS.some((kw) => label === kw || label.includes(kw));
}

// ─── Capture a single screen ──────────────────────────────────────────────────

async function captureScreen(screenName: string): Promise<MobileSelectorEntry[]> {
  const raw = await runMaestroCommand(["hierarchy"], 30_000);
  const root = parseHierarchyOutput(raw);
  const results: MobileSelectorEntry[] = [];
  extractNodes(root, results, screenName);
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MobileCrawlResult {
  entries: MobileSelectorEntry[];
  crawledAt: string;
}

// Capture a single screen that the user has manually navigated to on the device.
// No app launch, no navigation — just `maestro hierarchy` against the current foreground screen.
export async function crawlSingleScreen(screenName: string): Promise<MobileCrawlResult> {
  const trimmed = screenName.trim();
  if (!trimmed) throw new Error("screenName is required");

  const entries = await captureScreen(trimmed);
  console.info(`[crawler-maestro] Single-screen "${trimmed}": ${entries.length} elements`);

  return {
    entries,
    crawledAt: new Date().toISOString(),
  };
}

export async function crawlMobileApp(appId: string): Promise<MobileCrawlResult> {
  // No auto-launch: the app must already be open on the device before crawling.
  // waitForAnimationToEnd can block indefinitely on apps with persistent loaders,
  // so we rely on the user having the app in the foreground at crawl time.

  // 2. Capture home screen.
  const homeEntries = await captureScreen("Home");
  console.info(`[crawler-maestro] Home: ${homeEntries.length} elements`);

  // 3. Find navigation candidates on the home screen.
  const navCandidates = homeEntries.filter(isNavElement);

  const allEntries: MobileSelectorEntry[] = [...homeEntries];
  const visitedTexts = new Set(homeEntries.map((e) => e.text).filter(Boolean) as string[]);
  const visitedLabels = new Set(navCandidates.map((e) => e.text || e.accessibilityId || ""));

  // 4. Navigate to each candidate screen, capture, go back.
  for (const navEl of navCandidates.slice(0, 10)) {
    const tapTarget = navEl.text || navEl.accessibilityId;
    if (!tapTarget || visitedLabels.size === 0) continue;

    const screenName = tapTarget
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    let tapFlowPath: string | null = null;
    let backFlowPath: string | null = null;

    try {
      // Tap the nav element and wait a fixed 2s for the screen to settle.
      tapFlowPath = writeTempFlow(appId, [
        `- tapOn: "${tapTarget}"`,
        "- sleep: 2000",
      ]);
      await runMaestroCommand(["test", tapFlowPath], 15_000);

      // Capture the new screen.
      const screenEntries = await captureScreen(screenName);

      // Add only elements not yet seen (avoid duplicating home screen entries).
      for (const entry of screenEntries) {
        if (entry.text && visitedTexts.has(entry.text)) continue;
        allEntries.push(entry);
        if (entry.text) visitedTexts.add(entry.text);
      }

      console.info(`[crawler-maestro] ${screenName}: ${screenEntries.length} elements (${allEntries.length} total)`);

      // Go back to home.
      backFlowPath = writeTempFlow(appId, [
        "- back",
        "- sleep: 1500",
      ]);
      await runMaestroCommand(["test", backFlowPath], 10_000);

    } catch (err) {
      console.warn(`[crawler-maestro] Skipping "${tapTarget}":`, (err as Error).message);
      // Best-effort: still try to get back home before the next iteration.
      if (backFlowPath) {
        try { await runMaestroCommand(["test", backFlowPath], 10_000); } catch { /* ignore */ }
      } else {
        const emergencyBack = writeTempFlow(appId, ["- back", "- sleep: 1000"]);
        try { await runMaestroCommand(["test", emergencyBack], 10_000); } catch { /* ignore */ }
        cleanupTempFlow(emergencyBack);
      }
    } finally {
      if (tapFlowPath) cleanupTempFlow(tapFlowPath);
      if (backFlowPath) cleanupTempFlow(backFlowPath);
    }
  }

  // 5. Deduplicate by (text, accessibilityId, resourceId) triple.
  const seen = new Set<string>();
  const entries = allEntries.filter((e) => {
    const key = `${e.text ?? ""}|${e.accessibilityId ?? ""}|${e.resourceId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.info(`[crawler-maestro] Final registry: ${entries.length} unique elements from ${appId}`);

  return {
    entries,
    crawledAt: new Date().toISOString(),
  };
}
