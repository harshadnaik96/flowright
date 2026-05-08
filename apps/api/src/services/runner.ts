import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { db } from "../db/client";
import { testRuns, stepResults, flows, flowSteps, environments, selectorHealings, healTelemetry } from "../db/schema";
import { eq } from "drizzle-orm";
import { decryptAuth } from "./encryption";
import type { EnvironmentAuth, RunStatus } from "@flowright/shared";
import { addRunListener, broadcast } from "./ws-broadcast";
import { uploadScreenshot } from "./storage";
import { healSelector, type HealAttempt } from "./self-heal";

export { addRunListener };

// ─── Human-readable error translation ─────────────────────────────────────────
// Converts raw Playwright timeout messages into plain-English failure reasons.

// Strip ANSI escape codes (e.g. \u001b[2m ... \u001b[22m) from Playwright logs
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

function humanizeError(raw: string): string {
  const clean = stripAnsi(raw);

  // Extract the locator description from Playwright call logs
  // e.g. "waiting for getByText('Anomaly').first() to be visible"
  // e.g. "waiting for locator('input[type="number"]...').first() to be visible"
  const visibleMatch = clean.match(/waiting for (.+?) to be visible/);
  const hiddenMatch = clean.match(/waiting for (.+?) to be hidden/);
  const attachedMatch = clean.match(/waiting for (.+?) to be attached/);

  const isTimeout = clean.includes("Timeout") && clean.includes("exceeded");

  if (isTimeout && visibleMatch) {
    const locatorDesc = visibleMatch[1];
    const textMatch = locatorDesc.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return `'${textMatch[1]}' was not found on the page`;
    return `Element was not found on the page (${locatorDesc})`;
  }

  if (isTimeout && hiddenMatch) {
    const locatorDesc = hiddenMatch[1];
    const textMatch = locatorDesc.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return `'${textMatch[1]}' is still visible on the page`;
    return `Element is still visible on the page (${locatorDesc})`;
  }

  if (isTimeout && attachedMatch) {
    const locatorDesc = attachedMatch[1];
    return `Element not found in DOM (${locatorDesc})`;
  }

  if (clean.includes("strict mode violation")) {
    const countMatch = clean.match(/resolved to (\d+) elements/);
    const selectorMatch = clean.match(/locator\('(.+?)'\)/);
    const count = countMatch?.[1] ?? "multiple";
    const sel = selectorMatch?.[1] ?? "the selector";
    return `Selector matched ${count} elements — use a more specific selector (matched: ${sel})`;
  }
  if (isTimeout && raw.includes("locator.click")) return "Could not click element — not found or not interactive";
  if (isTimeout && raw.includes("locator.fill")) return "Could not type into element — input not found";
  if (isTimeout && raw.includes("locator.check")) return "Could not check element — not found";
  if (isTimeout && raw.includes("locator.selectOption")) return "Could not select option — element not found";
  if (raw.includes("Expected text to contain")) return raw; // already readable
  if (raw.includes("Expected value")) return raw;           // already readable
  if (raw.includes("Expected URL")) return raw;             // already readable
  if (raw.includes("Page did not navigate to URL containing")) return raw; // already readable
  if (raw.includes("waitForURL")) {
    const urlMatch = raw.match(/waitForURL.*?"(.+?)"/);
    return urlMatch ? `Page did not navigate to '${urlMatch[1]}'` : "Page did not navigate to the expected URL";
  }

  return raw; // fallback: return as-is
}

// ─── Retry classification ─────────────────────────────────────────────────────
// Only retry transient failures (timing, navigation, network). Deterministic
// failures like assertion mismatches won't change on a re-run — retrying them
// just multiplies the run duration with no chance of recovery.

function isTransientError(raw: string): boolean {
  const clean = stripAnsi(raw);

  // Deterministic — do NOT retry. Re-running won't change the answer.
  if (clean.includes("Expected text to contain")) return false;
  if (clean.includes("Expected value")) return false;
  if (clean.includes("Expected URL")) return false;
  if (clean.includes("Expected element to be enabled")) return false;
  if (clean.includes("Expected element to be disabled")) return false;
  if (clean.includes("strict mode violation")) return false;

  // Transient — worth retrying.
  if (clean.includes("Timeout") && clean.includes("exceeded")) return true;
  if (clean.includes("waitForURL")) return true;
  if (clean.includes("Page did not navigate")) return true;
  if (/net::ERR_/i.test(clean)) return true;
  if (clean.includes("Target closed") || clean.includes("Target page, context or browser has been closed")) return true;
  if (clean.includes("Execution context was destroyed")) return true;
  if (/element is not (visible|attached|stable|enabled)/i.test(clean)) return true;

  // Unknown — default to retrying once. Conservative: better to spend an extra
  // attempt than to fail on a flake we didn't classify.
  return true;
}

function backoffMs(attempt: number): number {
  // Exponential with jitter: 500, 1000, 2000, 4000, 8000 (capped) + 0–250ms
  const base = Math.min(8000, 500 * Math.pow(2, attempt - 1));
  return base + Math.floor(Math.random() * 250);
}

// ─── Cypress → Playwright command executor ────────────────────────────────────
// Builds a cy proxy that enqueues Playwright actions synchronously, then flushes

type CyChain = {
  click: () => CyChain;
  type: (text: string) => CyChain;
  clear: () => CyChain;
  select: (value: string) => CyChain;
  check: () => CyChain;
  uncheck: () => CyChain;
  focus: () => CyChain;
  scrollIntoView: () => CyChain;
  first: () => CyChain;
  last: () => CyChain;
  eq: (n: number) => CyChain;
  contains: (text: string) => CyChain;
  should: (assertion: string, value?: string) => CyChain;
  and: (assertion: string, value?: string) => CyChain;
};

type LocatorFactory = () => ReturnType<Page["locator"]> | Promise<ReturnType<Page["locator"]>>;

function buildCy(page: Page, baseUrl: string, queue: Array<() => Promise<unknown>>) {
  // Mutable warning captured during execution and read after the queue flushes.
  let clickWarning: string | undefined;

  const makeChain = (getLocator: LocatorFactory): CyChain => {
    const resolve = () => Promise.resolve(getLocator());
    // Resolve and narrow to a single element. .first() is a safe no-op on
    // already-specific locators (.nth(n), .first(), etc.) but prevents Playwright
    // strict-mode violations when a selector like div:has-text("X") matches
    // multiple ancestor elements.
    const resolveOne = async () => (await resolve()).first();
    const chain: CyChain = {
      click: () => {
        queue.push(async () => {
          const urlBefore = page.url();
          const el = await resolveOne();

          // Detect non-interactive elements (plain div/span with no role or href).
          // These are valid in Tailwind SPAs (onClick handlers on divs) but risky —
          // if the selector matched the wrong element, navigation silently won't happen.
          // We capture this as a plain-English warning visible to the tester.
          const tagName: string = await el.evaluate((node) => node.tagName.toLowerCase()).catch(() => "unknown");
          const role: string | null = await el.getAttribute("role").catch(() => null);
          const href: string | null = await el.getAttribute("href").catch(() => null);
          const isInteractive =
            ["a", "button", "input", "select", "textarea"].includes(tagName) ||
            ["link", "button", "menuitem", "tab", "option"].includes(role ?? "");
          if (!isInteractive && !href) {
            clickWarning = `Clicked a <${tagName}> element with no link role or href — this is a plain div used as a nav item. If navigation was expected and the next step fails, the selector may have matched the wrong element on the page.`;
          }

          await el.click({ timeout: 10000 });
          // For SPA navigation: wait for the URL to actually change before
          // proceeding. domcontentloaded resolves immediately in SPAs (the
          // document is already loaded), causing the next step to run before
          // the route transition completes (blank page, wrong URL).
          // If no URL change within 5s (non-navigation click like a modal or
          // toggle), continue anyway.
          await page.waitForURL((url) => url.href !== urlBefore, { timeout: 5000 })
            .catch(() => {});
          // Then wait for the new page's content to load.
          await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        });
        return chain;
      },
      type: (text) => {
        queue.push(async () => {
          const el = await resolveOne();
          await el.waitFor({ timeout: 10000 });

          // Detect split OTP inputs: individual digit boxes each with maxlength="1".
          // These use JS auto-advance — filling one box doesn't propagate to the rest.
          // pressSequentially on the first box fires real keystrokes so auto-advance
          // works correctly (same approach as authenticateCredentials in crawler.ts).
          const maxLen = await el.getAttribute("maxlength").catch(() => null);
          if (maxLen === "1") {
            const splitCount = await page.locator('input[maxlength="1"]').count();
            if (splitCount >= 4) {
              // Always start from the very first box in the group — the LLM command
              // may have resolved to .first() already, but we re-anchor here to be safe.
              const firstBox = page.locator('input[maxlength="1"]').first();
              await firstBox.click();
              await firstBox.pressSequentially(text, { delay: 80 });
              return;
            }
          }

          // Normal input — fill replaces the full value in one shot
          await el.fill(text, { timeout: 10000 });
        });
        return chain;
      },
      clear: () => { queue.push(async () => (await resolveOne()).clear({ timeout: 10000 })); return chain; },
      select: (value) => { queue.push(async () => (await resolveOne()).selectOption(value, { timeout: 10000 })); return chain; },
      check: () => { queue.push(async () => (await resolveOne()).check({ timeout: 10000 })); return chain; },
      uncheck: () => { queue.push(async () => (await resolveOne()).uncheck({ timeout: 10000 })); return chain; },
      focus: () => { queue.push(async () => (await resolveOne()).focus({ timeout: 10000 })); return chain; },
      scrollIntoView: () => { queue.push(async () => (await resolveOne()).scrollIntoViewIfNeeded({ timeout: 10000 })); return chain; },
      first: () => makeChain(async () => (await resolve()).first()),
      last: () => makeChain(async () => (await resolve()).last()),
      eq: (n) => makeChain(async () => (await resolve()).nth(n)),
      contains: (text) => makeChain(async () => {
        // Scoped contains: if the parent locator resolves, search within it.
        // Otherwise fall back to page-wide with the same priority order as
        // the top-level cy.contains() — nav/sidebar links first, then any
        // interactive element, then any element.
        const parent = await resolve();
        const parentCount = await parent.count();
        const scope = parentCount > 0 ? parent : page;

        const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const exactRegex = new RegExp(`^${escaped}$`);

        if (parentCount === 0) {
          // Page-wide: try nav/sidebar first, including plain-div cursor-pointer
          // items that Tailwind SPAs commonly use instead of <a>/<button>.
          const navLink = page
            .locator("aside a, nav a, [role='navigation'] a, aside button, nav button, [role='navigation'] button, [role='menuitem'], aside [class*='cursor-pointer'], nav [class*='cursor-pointer']")
            .filter({ hasText: exactRegex });
          if (await navLink.count() > 0) return navLink.first();
        }

        const interactive = scope
          .locator('a, button, [role="link"], [role="button"], [role="tab"], [role="option"]')
          .filter({ hasText: exactRegex });
        if (await interactive.count() > 0) return interactive.first();

        // getByRole uses accessible-name matching (case-insensitive contains) and
        // only returns true interactive elements — avoids clicking non-navigating
        // elements like metric card labels that share the same text as a nav link.
        const roleLink = scope.getByRole('link', { name: text });
        if (await roleLink.count() > 0) return roleLink.first();

        const roleButton = scope.getByRole('button', { name: text });
        if (await roleButton.count() > 0) return roleButton.first();

        // Plain-div SPA nav items scoped to the parent or sidebar containers
        const sidebarPointer = (parentCount > 0 ? scope : page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]'))
          .locator('[class*="cursor-pointer"], [style*="cursor: pointer"], [style*="cursor:pointer"]')
          .filter({ hasText: exactRegex });
        if (await sidebarPointer.count() > 0) return sidebarPointer.first();

        const exact = scope.getByText(text, { exact: true });
        if (await exact.count() > 0) return exact.first();
        return scope.getByText(text, { exact: false }).first();
      }),
      should: (assertion, value) => {
        queue.push(async () => {
          const loc = await resolveOne();
          switch (assertion) {
            case "be.visible":
              await loc.waitFor({ state: "visible", timeout: 10000 }); break;
            case "not.be.visible":
            case "not.exist":
              await loc.waitFor({ state: "hidden", timeout: 10000 }); break;
            case "exist":
              await loc.waitFor({ state: "attached", timeout: 10000 }); break;
            case "contain":
            case "contain.text":
            case "include.text": {
              await loc.waitFor({ state: "visible", timeout: 10000 });
              const text = await loc.textContent();
              if (value && !text?.includes(value))
                throw new Error(`Expected text to contain "${value}" but got "${text}"`);
              break;
            }
            case "have.value": {
              const actual = await loc.inputValue();
              if (actual !== value)
                throw new Error(`Expected value "${value}" but got "${actual}"`);
              break;
            }
            case "be.enabled": {
              const disabled = await loc.isDisabled();
              if (disabled) throw new Error("Expected element to be enabled");
              break;
            }
            case "be.disabled": {
              const enabled = await loc.isEnabled();
              if (enabled) throw new Error("Expected element to be disabled");
              break;
            }
          }
        });
        return chain;
      },
      and: (assertion, value) => chain.should(assertion, value),
    };
    return chain;
  };

  return {
    visit: (url: string) => {
      queue.push(async () => {
        const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
        await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        // After the HTML is parsed, wait for the JS bundle to execute and render
        // the SPA. "load" fires once all resources (JS/CSS) have finished loading,
        // which is when React/Next.js will have mounted the initial UI.
        await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
      });
      return { should: () => ({}) };
    },

    get: (selector: string) => makeChain(() => page.locator(selector)),

    contains: (selectorOrText: string, text?: string) => {
      if (text === undefined) {
        // Resolution order for unscoped cy.contains(text):
        // 1. Sidebar / nav links — catches "tap X from the sidebar" steps where a
        //    same-named element also exists in the page content (e.g. a "Reports"
        //    dashboard widget vs the "Reports" sidebar nav link).
        // 2. Any interactive element (link, button, menuitem…) with exact text.
        // 3. Any element with exact text.
        // 4. Any element with partial text (last resort).
        return makeChain(async () => {
          const escaped = selectorOrText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const exactRegex = new RegExp(`^${escaped}$`);

          const navLink = page
            .locator("aside a, nav a, [role='navigation'] a, aside button, nav button, [role='navigation'] button, [role='menuitem'], aside [class*='cursor-pointer'], nav [class*='cursor-pointer']")
            .filter({ hasText: exactRegex });
          if (await navLink.count() > 0) return navLink.first();

          const interactive = page
            .locator('a, button, [role="link"], [role="button"], [role="tab"], [role="option"]')
            .filter({ hasText: exactRegex });
          if (await interactive.count() > 0) return interactive.first();

          // getByRole uses accessible-name matching (case-insensitive contains) and
          // only returns true interactive elements — avoids clicking non-navigating
          // elements like metric card labels that share the same text as a nav link.
          const roleLink = page.getByRole('link', { name: selectorOrText });
          if (await roleLink.count() > 0) return roleLink.first();

          const roleButton = page.getByRole('button', { name: selectorOrText });
          if (await roleButton.count() > 0) return roleButton.first();

          // Plain-div SPA nav items: many Tailwind/CSS-framework sidebars use
          // <div class="... cursor-pointer ..."> instead of <a> or <button>.
          // Scope to sidebar containers so we don't match non-navigating elements
          // (e.g. metric card labels) that share the same text.
          const sidebarPointer = page
            .locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]')
            .locator('[class*="cursor-pointer"], [style*="cursor: pointer"], [style*="cursor:pointer"]')
            .filter({ hasText: exactRegex });
          if (await sidebarPointer.count() > 0) return sidebarPointer.first();

          const exact = page.getByText(selectorOrText, { exact: true });
          if (await exact.count() > 0) return exact.first();
          return page.getByText(selectorOrText, { exact: false }).first();
        });
      }
      return makeChain(() => page.locator(selectorOrText, { hasText: text }).first());
    },

    url: () => ({
      should: (assertion: string, value?: string) => {
        queue.push(async () => {
          if ((assertion === "include" || assertion === "contain") && value) {
            // Wait for any in-flight navigation (e.g. React Router SPA click) to
            // settle before checking the URL. domcontentloaded is enough and fast.
            await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
            try {
              await page.waitForURL(`**${value}**`, { timeout: 10000 });
            } catch {
              const actualUrl = page.url();
              throw new Error(`Page did not navigate to URL containing '${value}'. Actual URL: '${actualUrl}'`);
            }
          } else if ((assertion === "eq" || assertion === "equal") && value) {
            await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
            const current = page.url();
            if (current !== value) throw new Error(`Expected URL "${value}" but got "${current}"`);
          }
        });
        return {};
      },
    }),

    wait: (ms: number) => { queue.push(() => page.waitForTimeout(ms)); },
    reload: () => { queue.push(() => page.reload({ waitUntil: "domcontentloaded" }).then(() => {})); },
    getWarning: () => clickWarning,
  };
}

async function executeStep(
  page: Page,
  command: string,
  envVars: Record<string, string>,
  baseUrl: string
): Promise<{ warningMessage?: string }> {
  const queue: Array<() => Promise<unknown>> = [];

  // Resolve Cypress.env('key') → actual value
  const resolved = command.replace(
    /Cypress\.env\(['"]([^'"]+)['"]\)/g,
    (_match, key: string) => JSON.stringify(envVars[key] ?? "")
  );

  const cy = buildCy(page, baseUrl, queue);

  // Execute the command string synchronously to populate the queue
  // eslint-disable-next-line no-new-func
  const fn = new Function("cy", resolved);
  fn(cy);

  // Flush actions sequentially
  for (const action of queue) {
    await action();
  }

  return { warningMessage: cy.getWarning() };
}

// ─── Main run orchestrator ─────────────────────────────────────────────────────

export async function startRun(runId: string): Promise<void> {
  let browser: Browser | undefined;

  try {
    const [run] = await db.select().from(testRuns).where(eq(testRuns.id, runId));
    if (!run) throw new Error("Run not found");

    const [flow] = await db.select().from(flows).where(eq(flows.id, run.flowId));
    if (!flow) throw new Error("Flow not found");
    const maxAttempts = Math.max(1, (flow.maxRetries ?? 2) + 1);

    const steps = await db
      .select()
      .from(flowSteps)
      .where(eq(flowSteps.flowId, run.flowId))
      .orderBy(flowSteps.order);

    const [env] = await db.select().from(environments).where(eq(environments.id, run.environmentId));
    if (!env) throw new Error("Environment not found");

    const auth = decryptAuth(env.auth as EnvironmentAuth);
    const runtimeVars = run.runtimeVariables as Record<string, string>;

    const envVars: Record<string, string> = {
      ...runtimeVars,
      baseUrl: env.baseUrl,
      ...(auth.otp ? { env_otp: auth.otp } : {}),
      ...(auth.mpin ? { env_mpin: auth.mpin } : {}),
      // Canonical keys (env_email / env_password) + legacy aliases (email / password)
      ...(auth.email ? { env_email: auth.email, email: auth.email } : {}),
      ...(auth.password ? { env_password: auth.password, password: auth.password } : {}),
    };

    await db.update(testRuns).set({ status: "running" }).where(eq(testRuns.id, runId));

    broadcast(runId, { type: "run:started", runId, payload: { totalSteps: steps.length } });

    browser = await chromium.launch({ headless: true });

    let context: BrowserContext;
    if (auth.type === "sso" && auth.storageState) {
      try {
        context = await browser.newContext({ storageState: JSON.parse(auth.storageState) });
      } catch {
        context = await browser.newContext();
      }
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    let overallStatus: RunStatus = "passed";

    // ── Prerequisite phase ─────────────────────────────────────────────────────
    // If this flow has a prerequisite, run its steps silently in the same browser
    // session before the main steps. Auth cookies / session state carry over.
    if (flow.prerequisiteFlowId) {
      const [prereqFlow] = await db.select().from(flows).where(eq(flows.id, flow.prerequisiteFlowId));
      if (prereqFlow) {
        const prereqSteps = await db
          .select()
          .from(flowSteps)
          .where(eq(flowSteps.flowId, prereqFlow.id))
          .orderBy(flowSteps.order);

        broadcast(runId, {
          type: "setup:started",
          runId,
          payload: { setupFlowName: prereqFlow.name, setupTotalSteps: prereqSteps.length },
        });

        let setupFailed = false;
        let setupError: string | undefined;

        for (const prereqStep of prereqSteps) {
          try {
            await executeStep(page, prereqStep.command, envVars, env.baseUrl);
          } catch (err) {
            setupFailed = true;
            setupError = humanizeError(err instanceof Error ? err.message : String(err));
            break;
          }
        }

        if (setupFailed) {
          broadcast(runId, { type: "setup:failed", runId, payload: { errorMessage: setupError } });
          // Mark all main steps as skipped — the run cannot proceed
          for (const step of steps) {
            await db.insert(stepResults).values({
              runId,
              stepId: step.id,
              order: step.order,
              plainEnglish: step.plainEnglish,
              status: "skipped",
              screenshotPath: null,
              errorMessage: null,
              durationMs: null,
            });
          }
          overallStatus = "failed";
          await browser.close();
          browser = undefined;
          await db.update(testRuns).set({ status: "failed", completedAt: new Date() }).where(eq(testRuns.id, runId));
          broadcast(runId, { type: "run:completed", runId, payload: { status: "failed" } });
          return;
        }

        broadcast(runId, { type: "setup:completed", runId, payload: {} });
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const startTime = Date.now();

      broadcast(runId, {
        type: "step:started",
        runId,
        payload: { stepOrder: step.order, plainEnglish: step.plainEnglish },
      });

      let status: "passed" | "failed" = "passed";
      let errorMessage: string | undefined;
      let warningMessage: string | undefined;
      let screenshotRelPath: string | undefined;
      let attempts = 0;
      let activeCommand = step.command;
      let healPending: {
        originalCommand: string;
        healedCommand: string;
        originalSelector: string | null;
        healedSelector: string | null;
        errorMessage: string;
      } | null = null;
      let wasHealed = false;
      let healAttemptRecord: HealAttempt | null = null;
      let healAttemptNumber = 0;
      let healTriggered = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attempts = attempt;
        try {
          const result = await executeStep(page, activeCommand, envVars, env.baseUrl);
          warningMessage = result.warningMessage;
          status = "passed";
          errorMessage = undefined;
          if (healPending) wasHealed = true;
          break;
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          errorMessage = humanizeError(raw);
          status = "failed";
          const transient = isTransientError(raw);

          // Try a single heal pass on the first failure of the original command.
          // Web runner only — mobile uses Maestro's native matching.
          if (!healTriggered) {
            try {
              const heal = await healSelector({
                page,
                command: activeCommand,
                plainEnglish: step.plainEnglish,
                errorMessage,
                onProgress: (message) => {
                  broadcast(runId, {
                    type: "step:heal-log",
                    runId,
                    payload: { stepOrder: step.order, healLogMessage: message },
                  });
                },
              });
              healAttemptRecord = heal;
              healAttemptNumber = attempt;
              healTriggered = true;
              if (heal.result && heal.result.healedCommand !== activeCommand) {
                healPending = {
                  originalCommand: activeCommand,
                  healedCommand: heal.result.healedCommand,
                  originalSelector: heal.result.originalSelector,
                  healedSelector: heal.result.healedSelector,
                  errorMessage,
                };
                broadcast(runId, {
                  type: "step:healed",
                  runId,
                  payload: {
                    stepOrder: step.order,
                    plainEnglish: step.plainEnglish,
                    originalSelector: heal.result.originalSelector ?? undefined,
                    healedSelector: heal.result.healedSelector ?? undefined,
                    attempt,
                    maxAttempts,
                  },
                });
                activeCommand = heal.result.healedCommand;
              }
            } catch {
              // heal failure is non-fatal — fall through to normal retry
            }
          }

          // If a heal proposal came in this iteration, always give it one shot
          // — the new command may succeed even if the original error was
          // deterministic. Otherwise, abort retries on non-transient errors:
          // re-running an assertion mismatch wastes time without any chance
          // of recovery.
          const healJustApplied = healPending !== null && activeCommand === healPending.healedCommand;
          if (!transient && !healJustApplied) break;

          if (attempt < maxAttempts) {
            const delay = backoffMs(attempt);
            broadcast(runId, {
              type: "step:retry",
              runId,
              payload: {
                stepOrder: step.order,
                plainEnglish: step.plainEnglish,
                attempt,
                maxAttempts,
                errorMessage,
              },
            });
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (status === "failed") overallStatus = "failed";

      try {
        const filename = `step-${step.order}.png`;
        const buffer = await page.screenshot({ fullPage: false });
        screenshotRelPath = await uploadScreenshot(runId, filename, buffer);
      } catch {
        // screenshot failure is non-fatal
      }

      const durationMs = Date.now() - startTime;

      await db.insert(stepResults).values({
        runId,
        stepId: step.id,
        order: step.order,
        plainEnglish: step.plainEnglish,
        status,
        screenshotPath: screenshotRelPath ?? null,
        errorMessage: errorMessage ?? null,
        warningMessage: warningMessage ?? null,
        durationMs,
        attempts,
        wasHealed,
      });

      // If a heal was applied AND the step ultimately passed, queue the
      // proposal for human review. Failed heals (didn't fix the step) are
      // dropped — they aren't useful to review.
      if (healPending && wasHealed) {
        await db.insert(selectorHealings).values({
          runId,
          stepId: step.id,
          flowId: run.flowId,
          originalCommand: healPending.originalCommand,
          healedCommand: healPending.healedCommand,
          originalSelector: healPending.originalSelector ?? null,
          healedSelector: healPending.healedSelector ?? null,
          errorMessage: healPending.errorMessage,
          screenshotPath: screenshotRelPath ?? null,
          status: "pending",
        });
      }

      // Heal telemetry — one row per triggered heal attempt regardless of
      // outcome. This is the empirical signal for measuring heal quality
      // (success rate, latency, false-positive triggers, no-proposal cases).
      if (healTriggered && healAttemptRecord) {
        const outcome = !healAttemptRecord.result
          ? "no_proposal"
          : wasHealed
          ? "recovered"
          : "failed_after_heal";
        await db.insert(healTelemetry).values({
          runId,
          stepId: step.id,
          flowId: run.flowId,
          attempt: healAttemptNumber,
          triggerErrorMessage: healAttemptRecord.triggerErrorMessage,
          elementsExtracted: healAttemptRecord.elementsExtracted,
          liveExtractMs: healAttemptRecord.liveExtractMs,
          proposalLatencyMs: healAttemptRecord.proposalLatencyMs,
          proposalReceived: healAttemptRecord.proposalReceived,
          rejectedReason: healAttemptRecord.rejectedReason,
          originalCommand: step.command,
          proposedCommand: healAttemptRecord.proposedCommand,
          originalSelector: healAttemptRecord.originalSelector,
          proposedSelector: healAttemptRecord.proposedSelector,
          reasoning: healAttemptRecord.reasoning,
          outcome,
        });
      }

      broadcast(runId, {
        type: status === "passed" ? "step:passed" : "step:failed",
        runId,
        payload: {
          stepOrder: step.order,
          plainEnglish: step.plainEnglish,
          screenshotPath: screenshotRelPath,
          errorMessage,
          warningMessage,
          attempt: attempts,
          maxAttempts,
          healedSelector: wasHealed ? healPending?.healedSelector ?? undefined : undefined,
          originalSelector: wasHealed ? healPending?.originalSelector ?? undefined : undefined,
        },
      });

      if (status === "failed") {
        // Mark remaining steps as skipped
        for (let j = i + 1; j < steps.length; j++) {
          const rem = steps[j];
          await db.insert(stepResults).values({
            runId,
            stepId: rem.id,
            order: rem.order,
            plainEnglish: rem.plainEnglish,
            status: "skipped",
            screenshotPath: null,
            errorMessage: null,
            durationMs: null,
          });
        }
        break;
      }
    }

    await browser.close();
    browser = undefined;

    await db
      .update(testRuns)
      .set({ status: overallStatus, completedAt: new Date() })
      .where(eq(testRuns.id, runId));

    broadcast(runId, { type: "run:completed", runId, payload: { status: overallStatus } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Run failed";
    try {
      await db.update(testRuns).set({ status: "error", completedAt: new Date() }).where(eq(testRuns.id, runId));
    } catch { /* ignore */ }
    broadcast(runId, { type: "run:error", runId, payload: { errorMessage: msg } });
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
  }
}
