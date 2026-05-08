import { spawn } from "child_process";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { join } from "path";
import { db } from "../db/client";
import { testRuns, stepResults, flowSteps, environments } from "../db/schema";
import { eq } from "drizzle-orm";
import { decryptAuth } from "./encryption";
import { buildAuthSubflowPreamble } from "./auth-subflow";
import { broadcast } from "./ws-broadcast";
import { uploadScreenshot } from "./storage";
import type { EnvironmentAuth, RunStatus } from "@flowright/shared";

const RUNS_BASE = process.env.SCREENSHOT_DIR ?? "/tmp/flowright-runs";

// ─── YAML builder ─────────────────────────────────────────────────────────────
// Assembles a Maestro flow YAML from DB step records.
// Each step's `command` field is already a valid Maestro YAML snippet,
// e.g. "- tapOn:\n    text: \"Login\"" or "- assertVisible: \"Dashboard\""

// Builds YAML for the local agent, injecting takeScreenshot after every user step.
// Screenshots are saved to a placeholder dir __RUN_DIR__ that the agent resolves
// at runtime to its actual tmpdir path.
export function buildFlowYamlForAgent(
  appId: string,
  stepCommands: string[],
  authSubflowPath: string | null | undefined
): string {
  const lines: string[] = [`appId: "${appId}"`, `---`];

  if (authSubflowPath) {
    lines.push(buildAuthSubflowPreamble(authSubflowPath).trimEnd());
  }

  for (let i = 0; i < stepCommands.length; i++) {
    lines.push(stepCommands[i].trimEnd());
    // Inject screenshot after each user step so we capture the post-step screen.
    // __RUN_DIR__ is replaced by the agent with its actual tmpdir at runtime.
    lines.push(`- takeScreenshot: __RUN_DIR__/step-${i + 1}.png`);
  }

  return lines.join("\n") + "\n";
}

function buildFlowYaml(
  appId: string,
  stepCommands: string[],
  authSubflowPath: string | null | undefined,
  screenshotDir: string,
): string {
  const lines: string[] = [`appId: "${appId}"`, `---`];

  if (authSubflowPath) {
    lines.push(buildAuthSubflowPreamble(authSubflowPath).trimEnd());
  }

  for (let i = 0; i < stepCommands.length; i++) {
    lines.push(stepCommands[i].trimEnd());
    // Capture the post-step screen — uploaded to Supabase (or FS fallback)
    // after we observe Maestro's takeScreenshot result line.
    lines.push(`- takeScreenshot: ${screenshotDir}/step-${i + 1}.png`);
  }

  return lines.join("\n") + "\n";
}

// ─── Stdout parser ────────────────────────────────────────────────────────────
// Maestro emits one result line per command, prefixed with ✅ or ❌.
// Examples:
//   ✅  Tap on "Login"
//   ❌  Assert visible "Dashboard" — Element not found

const PASS_RE = /✅/;
const FAIL_RE = /❌/;

// Extract the error detail that follows " — " on a failure line, if present.
function extractMaestroError(line: string): string {
  const sep = line.indexOf(" — ");
  if (sep !== -1) return line.slice(sep + 3).trim();
  // Fall back to the whole line minus the ❌ symbol
  return line.replace(/❌\s*/, "").trim();
}

// ─── Main mobile run orchestrator ─────────────────────────────────────────────

export async function startMobileRun(runId: string): Promise<void> {
  let tempYamlPath: string | undefined;

  try {
    // 1. Load run record
    const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId));
    if (!run) throw new Error("Run not found");

    // 2. Load flow steps (ordered)
    const steps = await db
      .select()
      .from(flowSteps)
      .where(eq(flowSteps.flowId, run.flowId))
      .orderBy(flowSteps.order);

    if (steps.length === 0) throw new Error("Flow has no steps");

    // 3. Load environment
    const [env] = await db
      .select()
      .from(environments)
      .where(eq(environments.id, run.environmentId));
    if (!env) throw new Error("Environment not found");

    const appId = env.baseUrl; // mobile environments store appId in baseUrl
    const auth = decryptAuth(env.auth as EnvironmentAuth);
    const runtimeVars = run.runtimeVariables as Record<string, string>;

    // 4. Build and write the Maestro flow YAML to a temp file
    const runDir = join(RUNS_BASE, runId);
    await mkdir(runDir, { recursive: true });

    tempYamlPath = join(runDir, "flow.yaml");
    const yaml = buildFlowYaml(appId, steps.map((s) => s.command), env.authSubflowPath, runDir);
    await writeFile(tempYamlPath, yaml, "utf-8");

    // 5. Build --env args: auth secrets + runtime variables
    //    Maestro injects these into ${VAR} references in the YAML.
    const envArgs: string[] = [];
    const addEnv = (key: string, value: string | undefined) => {
      if (value) envArgs.push("--env", `${key}=${value}`);
    };

    addEnv("PHONE", auth.phoneNumber ?? runtimeVars["phone"] ?? runtimeVars["PHONE"]);
    addEnv("OTP", auth.otp ?? runtimeVars["otp"] ?? runtimeVars["OTP"]);
    addEnv("MPIN", auth.mpin ?? runtimeVars["mpin"] ?? runtimeVars["MPIN"]);
    addEnv("EMAIL", auth.email ?? runtimeVars["email"] ?? runtimeVars["EMAIL"]);
    addEnv("PASSWORD", auth.password ?? runtimeVars["password"] ?? runtimeVars["PASSWORD"]);
    // Pass any remaining runtime variables through directly
    for (const [k, v] of Object.entries(runtimeVars)) {
      if (!["phone", "otp", "mpin", "email", "password", "PHONE", "OTP", "MPIN", "EMAIL", "PASSWORD"].includes(k)) {
        envArgs.push("--env", `${k}=${v}`);
      }
    }

    // 6. Mark run as running and broadcast start
    await db.update(testRuns).set({ status: "running" }).where(eq(testRuns.id, runId));
    broadcast(runId, { type: "run:started", runId, payload: { totalSteps: steps.length } });

    // 7. Spawn maestro test
    //    maestro test --env KEY=val ... <flow.yaml>
    const maestroArgs = ["test", ...envArgs, tempYamlPath];
    const child = spawn("maestro", maestroArgs, {
      env: process.env,
      // Maestro needs a TTY for colour output; stdio: pipe gives us clean stdout
    });

    // 8. Parse stdout line-by-line and emit WebSocket events per step
    //    If an auth subflow is present, its commands appear first in stdout —
    //    we skip those result lines and only map subsequent lines to our steps.
    let buffer = "";

    // Count auth subflow result lines to skip (rough estimate from subflow YAML)
    // Each command in the subflow YAML produces one ✅/❌ output line.
    // The `runFlow:` command itself also emits a summary line — we skip all
    // subflow lines until we've consumed `authSubflowResultCount` results.
    const authSubflowResultCount = env.authSubflowPath ? estimateSubflowStepCount(auth) : 0;
    let subflowResultsSeen = 0;

    let stepIndex = 0; // index into our steps[] array
    let overallStatus: RunStatus = "passed";

    // Buffer the most recent user-step result until the following takeScreenshot
    // result arrives — at that point the .png exists on disk and we can upload
    // it. Mirrors the pattern in apps/agent/src/run-job.ts.
    type PendingStep = {
      step: typeof steps[number];
      status: "passed" | "failed";
      errorMessage: string | undefined;
      screenshotFile: string;
    };
    let pending: PendingStep | null = null;

    const commitPending = async (uploadScreenshotFile: boolean): Promise<void> => {
      if (!pending) return;
      const { step, status, errorMessage, screenshotFile } = pending;
      pending = null;

      let screenshotPath: string | null = null;
      if (uploadScreenshotFile) {
        try {
          const buf = await readFile(screenshotFile);
          screenshotPath = await uploadScreenshot(runId, `step-${step.order}.png`, buf);
        } catch {
          // Screenshot file missing or unreadable — proceed without one.
        }
      }

      await db.insert(stepResults).values({
        runId,
        stepId: step.id,
        order: step.order,
        plainEnglish: step.plainEnglish,
        status,
        screenshotPath,
        errorMessage: errorMessage ?? null,
        warningMessage: null,
        durationMs: null,
      });

      broadcast(runId, {
        type: status === "passed" ? "step:passed" : "step:failed",
        runId,
        payload: {
          stepOrder: step.order,
          plainEnglish: step.plainEnglish,
          screenshotPath: screenshotPath ?? undefined,
          errorMessage,
        },
      });
    };

    const processLine = async (line: string) => {
      const isPass = PASS_RE.test(line);
      const isFail = FAIL_RE.test(line);
      if (!isPass && !isFail) return; // not a result line

      // Skip auth subflow result lines
      if (subflowResultsSeen < authSubflowResultCount) {
        subflowResultsSeen++;
        if (isFail) {
          // Auth failed — abort the run
          overallStatus = "failed";
          broadcast(runId, {
            type: "run:error",
            runId,
            payload: { errorMessage: `Auth subflow failed: ${extractMaestroError(line)}` },
          });
        }
        return;
      }

      // If a step is pending, this line is its takeScreenshot result.
      // Commit the step (uploading the screenshot if takeScreenshot succeeded).
      if (pending) {
        await commitPending(isPass);
        return;
      }

      if (stepIndex >= steps.length) return; // extra lines beyond our steps
      const step = steps[stepIndex];
      stepIndex++;

      broadcast(runId, {
        type: "step:started",
        runId,
        payload: { stepOrder: step.order, plainEnglish: step.plainEnglish },
      });

      const status: "passed" | "failed" = isPass ? "passed" : "failed";
      const errorMessage = isFail ? extractMaestroError(line) : undefined;
      if (isFail) overallStatus = "failed";

      pending = {
        step,
        status,
        errorMessage,
        screenshotFile: join(runDir, `step-${step.order}.png`),
      };
    };

    // Accumulate stdout, process complete lines
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the incomplete last line in the buffer
      for (const line of lines) {
        processLine(line).catch(() => {});
      }
    });

    let stderrAccum = "";
    child.stderr.on("data", (chunk: Buffer) => { stderrAccum += chunk.toString(); });

    // 9. Wait for process to exit
    await new Promise<void>((resolve, reject) => {
      child.on("error", (err) => reject(new Error(`Failed to spawn maestro: ${err.message}. Is Maestro CLI on PATH?`)));
      child.on("close", async (code) => {
        // Flush any remaining buffer content
        if (buffer.trim()) {
          await processLine(buffer).catch(() => {});
          buffer = "";
        }

        // If a step is still pending (Maestro halted on failure before its
        // takeScreenshot ran), commit it without a screenshot.
        if (pending) await commitPending(false).catch(() => {});

        // Mark any steps we never received results for as skipped
        for (let i = stepIndex; i < steps.length; i++) {
          const rem = steps[i];
          await db.insert(stepResults).values({
            runId,
            stepId: rem.id,
            order: rem.order,
            plainEnglish: rem.plainEnglish,
            status: "skipped",
            screenshotPath: null,
            errorMessage: null,
            durationMs: null,
          }).catch(() => {});
        }

        if (code !== 0 && overallStatus === "passed") {
          overallStatus = "failed";
        }

        resolve();
      });
    });

    // 10. Finalise run record
    await db
      .update(testRuns)
      .set({ status: overallStatus, completedAt: new Date() })
      .where(eq(testRuns.id, runId));

    broadcast(runId, { type: "run:completed", runId, payload: { status: overallStatus } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mobile run failed";
    try {
      await db.update(testRuns).set({ status: "error", completedAt: new Date() }).where(eq(testRuns.id, runId));
    } catch { /* ignore */ }
    broadcast(runId, { type: "run:error", runId, payload: { errorMessage: msg } });
  } finally {
    // Clean up the temp flow YAML
    if (tempYamlPath) {
      await unlink(tempYamlPath).catch(() => {});
    }
  }
}

// ─── Auth subflow step count estimator ────────────────────────────────────────
// Returns the number of Maestro result lines the auth subflow will emit,
// so the runner knows how many output lines to skip before our flow steps.

export function estimateSubflowStepCount(auth: EnvironmentAuth): number {
  if (auth.type === "credentials") {
    // tapOn + clearText + inputText (phone) + tapOn + tapOn + clearText + inputText (otp) + tapOn
    const base = 8;
    if (auth.mpin) return base + 3; // tapOn + clearText + inputText (mpin) + tapOn confirm
    return base;
  }
  if (auth.type === "email-password") {
    // tapOn + clearText + inputText (email) + tapOn + clearText + inputText (password) + tapOn
    return 7;
  }
  return 0;
}
