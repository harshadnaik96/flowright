import { spawn } from "child_process";
import { writeFile, mkdir, unlink } from "fs/promises";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type WebSocket from "ws";

// Must match the AgentJob shape sent by the server (apps/api/src/services/agent-registry.ts)
export interface AgentJob {
  runId: string;
  flowYaml: string;
  envVars: Record<string, string>;
  stepOrders: number[];   // DB order value for each user-visible step
  authStepCount: number;  // Maestro stdout lines emitted by the auth subflow preamble (to skip)
}

const PASS_RE = /✅/;
const FAIL_RE = /❌/;

function extractError(line: string): string {
  const sep = line.indexOf(" — ");
  if (sep !== -1) return line.slice(sep + 3).trim();
  return line.replace(/❌\s*/, "").trim();
}

function send(ws: WebSocket, msg: object): void {
  ws.send(JSON.stringify(msg));
}

export async function runJob(ws: WebSocket, job: AgentJob): Promise<void> {
  const { runId, flowYaml, envVars, stepOrders, authStepCount } = job;
  let tempYamlPath: string | undefined;

  try {
    // Write the Maestro flow YAML to a temp file.
    // Replace the __RUN_DIR__ placeholder with the actual tmpdir path so that
    // injected takeScreenshot commands save to the correct location.
    const runDir = join(tmpdir(), "flowright-agent", runId);
    await mkdir(runDir, { recursive: true });
    tempYamlPath = join(runDir, "flow.yaml");
    const resolvedYaml = flowYaml.replace(/__RUN_DIR__/g, runDir);
    await writeFile(tempYamlPath, resolvedYaml, "utf-8");
    console.log(`[flowright-agent] Flow YAML:\n${resolvedYaml}`);

    // Build --env KEY=value args
    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(envVars)) {
      envArgs.push("--env", `${k}=${v}`);
    }

    // Spawn: maestro test [--env ...] <flow.yaml>
    const maestroArgs = ["test", ...envArgs, tempYamlPath];
    const child = spawn("maestro", maestroArgs, { env: process.env });

    let buffer = "";
    let subflowSeen = 0;
    let stepIdx = 0;
    let overallStatus: "passed" | "failed" = "passed";

    // Screenshot buffering: each user step is followed by a takeScreenshot result line.
    // We buffer the step event until we see the screenshot line, then attach screenshot
    // data (base64) for failed steps before sending.
    let pendingStepMsg: Record<string, unknown> | null = null;
    let pendingScreenshotPath: string | null = null;
    let pendingStepFailed = false;

    const flushPending = (): void => {
      if (pendingStepMsg === null) return;
      send(ws, pendingStepMsg);
      pendingStepMsg = null;
      pendingScreenshotPath = null;
      pendingStepFailed = false;
    };

    const processLine = (line: string): void => {
      const isPass = PASS_RE.test(line);
      const isFail = FAIL_RE.test(line);
      if (!isPass && !isFail) return; // not a result line

      // Skip auth subflow result lines
      if (subflowSeen < authStepCount) {
        subflowSeen++;
        if (isFail) {
          overallStatus = "failed";
          send(ws, {
            type: "run:error",
            runId,
            errorMessage: `Auth subflow failed: ${extractError(line)}`,
          });
        }
        return;
      }

      // If a step is pending, this line is its takeScreenshot result
      if (pendingStepMsg !== null) {
        let screenshotData: string | undefined;
        if (pendingStepFailed && pendingScreenshotPath) {
          try {
            const buf = readFileSync(pendingScreenshotPath);
            screenshotData = buf.toString("base64");
          } catch { /* screenshot file not available */ }
        }
        send(ws, screenshotData
          ? { ...pendingStepMsg, screenshotData }
          : pendingStepMsg
        );
        pendingStepMsg = null;
        pendingScreenshotPath = null;
        pendingStepFailed = false;
        return;
      }

      if (stepIdx >= stepOrders.length) return; // extra lines beyond our steps
      const stepOrder = stepOrders[stepIdx];
      const screenshotPath = join(runDir, `step-${stepIdx + 1}.png`);
      stepIdx++;

      const errorMessage = isFail ? extractError(line) : undefined;
      if (isFail) overallStatus = "failed";

      // Buffer this event — wait for the takeScreenshot result line
      pendingStepMsg = {
        type: isFail ? "step:failed" : "step:passed",
        runId,
        stepOrder,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      };
      pendingScreenshotPath = screenshotPath;
      pendingStepFailed = isFail;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    // Log stderr — Maestro uses it for progress UI and error details
    let stderrAccum = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderrAccum += text;
      process.stderr.write(text);
    });

    await new Promise<void>((resolve, reject) => {
      child.on("error", (err) => {
        reject(new Error(`Failed to spawn maestro: ${err.message}. Is maestro installed and on PATH?`));
      });
      child.on("close", (code) => {
        // Flush any partial line remaining in buffer
        if (buffer.trim()) processLine(buffer);
        // Flush any buffered step whose screenshot line never arrived
        flushPending();
        if (code !== 0 && overallStatus === "passed") overallStatus = "failed";
        resolve();
      });
    });

    send(ws, {
      type: "run:completed",
      runId,
      status: overallStatus,
      ...(stderrAccum.trim() ? { errorMessage: stderrAccum.trim().slice(-3000) } : {}),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Agent run failed";
    send(ws, { type: "run:error", runId, errorMessage });
  } finally {
    if (tempYamlPath) await unlink(tempYamlPath).catch(() => {});
  }
}
