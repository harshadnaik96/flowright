---
title: "Test Runner"
---

# Stage 5 — Technical Reference: Runner + Results

## Overview
The runner takes an approved flow, executes each step, captures a screenshot after every step, streams live progress via WebSocket, and persists results to PostgreSQL.

The runner is platform-aware:
- **Web** (`platform = "web"`) — Playwright headless Chromium via a Cypress-to-Playwright transpiler
- **Mobile** (`platform = "android" | "ios"`) — Maestro CLI (`maestro test`), spawned as a child process; parses stdout for step events

---

## New Files

```
apps/api/src/
├── services/
│   ├── runner.ts              Web Playwright executor + WS broadcast registry
│   └── runner-maestro.ts      Mobile Maestro CLI executor + WS broadcast
└── routes/
    └── runner.ts              HTTP + WebSocket routes (platform-aware dispatch)

apps/web/src/
├── components/flow/
│   └── RunFlow.tsx            Client component — setup form + live view + results
└── app/projects/[id]/flows/[flowId]/
    └── run/
        └── page.tsx           Server component — fetches flow + environments
```

The runner route dispatches by platform:
```ts
if (project.platform === 'web') {
  await startRun(runId);         // Playwright
} else {
  await startMobileRun(runId);   // Maestro
}
```

---

## API Routes (`/runner`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/runner` | Create run + start async execution |
| `GET` | `/runner/agents` | List currently connected local agents |
| `GET` | `/runner?flowId=` | List runs for a flow |
| `GET` | `/runner/:runId` | Get run with `stepResults[]` |
| `GET` | `/runner/ws/:runId` | WebSocket — live progress stream |
| `GET` | `/runner/screenshots/:runId/:filename` | Serve PNG screenshot |

### POST /runner — Request body
```json
{
  "flowId": "uuid",
  "environmentId": "uuid",
  "runtimeVariables": { "PHONE_NUMBER": "9999999999" },
  "agentId": "token-uuid",  // optional — mobile only; omit to use first available agent
  "skipAuth": false         // optional — if true, auth subflow is not prepended (mobile only)
}
```

### POST /runner — Response
```json
{ "runId": "uuid" }
```
Returns immediately. Execution runs asynchronously. Connect to WebSocket before or right after.

### GET /runner/agents — Response
```json
[
  { "tokenId": "uuid", "name": "Harshad's MacBook", "connectedAt": "2026-04-11T..." }
]
```
Returns only currently connected agents (not all tokens). Use `tokenId` as `agentId` in `POST /runner`.

---

## Execution Flow

```
POST /runner
  → Insert testRuns row (status: pending)
  → startRun(runId) fired async
  → return { runId }

startRun(runId):
  1. Load run + steps + environment from DB
  2. Decrypt environment auth
  3. Build envVars: runtimeVariables + env_otp + env_mpin + baseUrl
  4. Update run status → "running"
  5. Broadcast run:started
  6. Launch headless Chromium
  7. Inject SSO storage state (if auth.type === "sso")
  8. For each step:
     a. Broadcast step:started
     b. Retry loop (up to 1 + flow.maxRetries attempts):
          - executeStep(page, activeCommand, envVars)
          - on success → break
          - on first failure only (web): if isSelectorPatternError(err)
              → re-extract live DOM, ask Gemini for a replacement command
              → if proposal → swap activeCommand, broadcast step:healed
          - classify error via isTransientError():
              · transient (timeout, navigation, "not visible/attached", net::ERR, target closed) → retry
              · deterministic (assertion mismatch, strict-mode violation) → break immediately
              · exception: if a heal proposal was just applied this iteration, give it one shot regardless
          - on failure (and attempt < max) → broadcast step:retry, sleep backoffMs(attempt)
              · backoff is exponential with jitter: 500ms → 1s → 2s → 4s → 8s cap, plus 0–250ms jitter
          - if final attempt healed AND step passed → insert selector_healings row (status=pending)
     c. page.screenshot() → uploadScreenshot(runId, "step-N.png", buffer)
          (Supabase if configured, else /tmp/flowright-runs/{runId}/step-N.png)
     d. Insert stepResults row (with attempts count)
     e. Broadcast step:passed or step:failed (with attempt + maxAttempts)
     f. If failed → insert remaining steps as "skipped", break
  10. Update run status → "passed" | "failed"
  11. Broadcast run:completed
```

---

---

## Mobile Runner — Agent Mode

Mobile runs always go through the local agent binary (`flowright-agent`):

```
POST /runner (mobile)
  → Insert testRuns row (status: pending)
  → buildFlowYamlForAgent() — generates Maestro YAML with injected takeScreenshot commands
  → agentRegistry.sendJob(tokenId, { runId, flowYaml, envVars, stepOrders, authStepCount })
  → return { runId }

Agent receives run:job over WebSocket:
  1. Resolve __RUN_DIR__ placeholder in YAML → actual tmpdir path
  2. Write resolved YAML to disk
  3. spawn: maestro test --env KEY=VAL <flow.yaml>
  4. Parse stdout line-by-line in pairs:
       User step result (✅/❌) → buffer event
       takeScreenshot result   → read PNG file (if failed), attach base64, send buffered event
  5. After all steps → send run:completed

Agent → API (over WebSocket):
  { type: "step:passed"|"step:failed", runId, stepOrder, errorMessage?, screenshotData? }
  { type: "run:completed", runId, status }

API agent-registry:
  → Save screenshotData (base64 PNG) to /tmp/flowright-runs/{runId}/step-{order}.png
  → Insert stepResult with screenshotPath
  → Broadcast WsEvent (with screenshotPath) to browser clients
```

### Screenshot injection

`buildFlowYamlForAgent` appends `- takeScreenshot: __RUN_DIR__/step-N.png` after every user step. The agent replaces `__RUN_DIR__` with its real tmpdir at runtime.

Screenshots are only sent to the server for **failed** steps (to minimise WebSocket payload size). For passed steps the screenshot file is captured locally but discarded.

### `authStepCount`

When an auth subflow is configured, the Maestro auth preamble emits its own ✅/❌ lines before the user steps. `authStepCount` estimates how many of those lines to skip. Screenshots are NOT injected into the auth subflow, so the count is unchanged.

### Direct server-side mobile runner

`startMobileRun(runId)` in `runner-maestro.ts` is an alternative path for running Maestro directly on the API server (when Maestro is installed server-side). It uses the same Maestro YAML format and **does inject `takeScreenshot` after every user step**, mirroring the agent path. Each step result is buffered until the following `takeScreenshot` result line arrives, at which point the PNG is uploaded via `uploadScreenshot()` and the step row is committed. If Maestro halts on a failed step before its screenshot runs, the step is committed without a screenshot when the process closes.

---

## Cypress → Playwright Transpiler

`executeStep` runs each `cypressCommand` string without Cypress CLI. It:
1. Resolves `Cypress.env('key')` → actual value from envVars
2. Builds a `cy` proxy object that enqueues Playwright actions synchronously
3. Executes the command string via `new Function('cy', command)` to populate the queue
4. Flushes the queue sequentially with `await`

### Supported command patterns

| Cypress | Playwright equivalent |
|---------|----------------------|
| `cy.visit(url)` | `page.goto(fullUrl)` |
| `cy.get(sel).click()` | `page.locator(sel).click()` |
| `cy.get(sel).type(val)` | `page.locator(sel).fill(val)` |
| `cy.get(sel).clear()` | `page.locator(sel).clear()` |
| `cy.get(sel).select(val)` | `page.locator(sel).selectOption(val)` |
| `cy.get(sel).check()` | `page.locator(sel).check()` |
| `cy.get(sel).should('be.visible')` | `loc.waitFor({ state: 'visible' })` |
| `cy.get(sel).should('not.exist')` | `loc.waitFor({ state: 'hidden' })` |
| `cy.get(sel).should('contain', text)` | `loc.textContent()` + includes check |
| `cy.get(sel).should('have.value', val)` | `loc.inputValue()` + equality check |
| `cy.url().should('include', path)` | `page.waitForURL(**path**)` |
| `cy.contains(text)` | `page.getByText(text)` |
| `cy.contains(sel, text)` | `page.locator(sel, { hasText: text })` |
| `cy.wait(ms)` | `page.waitForTimeout(ms)` |
| `.first()` / `.last()` / `.eq(n)` | `.first()` / `.last()` / `.nth(n)` |

Chaining works: `cy.get(sel).should('be.visible').click()` executes each action in order.

---

## WebSocket Events

All events conform to `WsEvent` from `@flowright/shared`. For the self-heal subsystem (extract/propose/persist + review API + frontend page), see **`technical/stage-6-self-heal.md`**.

| Event type | Payload fields |
|------------|---------------|
| `run:started` | `totalSteps` |
| `step:started` | `stepOrder`, `plainEnglish` |
| `step:retry` | `stepOrder`, `plainEnglish`, `attempt`, `maxAttempts`, `errorMessage` (last failure) |
| `step:healed` | `stepOrder`, `plainEnglish`, `originalSelector?`, `healedSelector?`, `attempt`, `maxAttempts` |
| `step:passed` | `stepOrder`, `plainEnglish`, `screenshotPath`, `attempt`, `maxAttempts`, `healedSelector?`, `originalSelector?` (when wasHealed) |
| `step:failed` | `stepOrder`, `plainEnglish`, `screenshotPath`, `errorMessage`, `attempt`, `maxAttempts` |
| `run:completed` | `status` ("passed" \| "failed") |
| `run:error` | `errorMessage` |

### Connecting from the browser
```js
const ws = new WebSocket("ws://api-host/runner/ws/{runId}")
ws.onmessage = (ev) => {
  const event = JSON.parse(ev.data) // WsEvent
}
```

Multiple clients can connect to the same `runId` simultaneously. The server fans out to all active connections.

---

## Screenshots

Storage is handled by `apps/api/src/services/storage.ts`. Two functions, uniform contract:

- `uploadScreenshot(runId, filename, buffer)` — persists the PNG and returns the **relative object path** `"{runId}/{filename}"`, which is what's stored in `stepResults.screenshotPath`. The same shape regardless of backend.
- `resolveScreenshot(runId, filename)` — returns either `{ kind: "redirect", url }` (Supabase signed URL, default 1h TTL via `SUPABASE_SIGNED_URL_TTL`) or `{ kind: "buffer", data }` (local FS).

Backends:

- **Cloud (default when configured)**: uploaded to Supabase Storage bucket `SUPABASE_BUCKET` (default `flowright-runs`) at object path `{runId}/step-{order}.png`. The bucket stays **private** — `GET /runner/screenshots/{runId}/{filename}` 302-redirects to a freshly minted signed URL with `Cache-Control: no-store` so an expired signed URL never gets cached. See `docs/SUPABASE_SETUP.md` for setup.
- **Local fallback (no Supabase env vars)**: written to `{SCREENSHOT_DIR}/{runId}/step-{order}.png` (default `/tmp/flowright-runs`). `GET /runner/screenshots/{runId}/{filename}` streams the file directly with `image/png`.

The frontend helper (`api.runner.screenshotUrl`) always builds a `/runner/screenshots/...` URL and lets the API handle the dispatch — no client-side knowledge of which backend is active.

**Web (`runner.ts`)**: screenshots captured by Playwright after every step (pass or fail) via `page.screenshot()` → `uploadScreenshot()`.

**Mobile, server-side (`runner-maestro.ts`)**: `takeScreenshot` injected after every user step in the YAML; each step result is buffered until the screenshot line arrives, at which point the PNG is uploaded.

**Mobile, agent path (`agent-registry.ts` ← `apps/agent/src/run-job.ts`)**: agent runs Maestro locally, base64-encodes failed-step screenshots, and streams them to the API via WebSocket. The API then calls `uploadScreenshot()` so the persistence path is identical to the other two runners. Screenshot failure is non-fatal — if the file is not readable, the step result is still recorded.

---

## Environment Variables

| Var | Description |
|-----|-------------|
| `SCREENSHOT_DIR` | Local fallback dir for screenshots when Supabase is not configured (default: `/tmp/flowright-runs`) |
| `SUPABASE_URL` | Supabase project URL — enables cloud storage. Bare URL only, no `/rest/v1/` suffix |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only — bypasses RLS for uploads) |
| `SUPABASE_BUCKET` | Bucket name (default: `flowright-runs`) — keep the bucket private |
| `SUPABASE_SIGNED_URL_TTL` | Signed URL lifetime in seconds (default: `3600`) |

---

## Auth handling at run time

### Web

| Auth type | Runner behaviour |
|-----------|-----------------|
| `none` | Launch plain context |
| `credentials` | Plain context — flow steps handle login via injected `phone_number`, `env_otp`, `env_mpin` |
| `sso` | Inject `storageState` into browser context so session is already active |
| `custom-script` | Plain context used |

### Mobile

| Auth type | Runner behaviour |
|-----------|-----------------|
| `none` | No auth subflow prepended |
| `credentials` | Maestro YAML includes `runFlow: subflows/env-{id}-auth.yaml` as first step; `PHONE`, `OTP`, `MPIN` passed as `--env` args |
| `email-password` | Same as credentials with `EMAIL` and `PASSWORD` env vars |

---

## Run page — Frontend

Route: `/projects/[id]/flows/[flowId]/run`

The server component fetches flow + environments + connected agents and passes them to `<RunFlow>`. All interactivity is in the client component.

### RunFlow state machine

```
setup    → user fills variables, picks environment (+ agent for mobile)
starting → POST /runner fires
running  → WS connected, steps update live
done     → final banner + screenshots revealed
```

The step list is rendered throughout. In `running` state, steps show spinners → checkmarks/Xs as WS events arrive. In `done` state, each step exposes a "View screenshot" toggle.

### Agent selector (mobile only)

For mobile flows, `GET /runner/agents` is fetched server-side at page load and passed to `RunFlow` as the `agents` prop. If more than one agent is connected, a radio-button selector appears in the setup form. The selected `agentId` is sent with `POST /runner` to target a specific device.

### Re-run with pre-filled config

The run page accepts two optional query parameters:
- `envId` — pre-select a specific environment
- `vars` — base64-encoded JSON of runtime variable values

These are decoded server-side and passed as `initialEnvId` / `initialVarValues` to `RunFlow`, which uses them as default state. This powers the Re-run button in the run history section.

## Run History

Route: `/projects/[id]/flows/[flowId]` (flow detail page)

The flow detail page now fetches the last 8 runs for the flow (alongside environments) and renders a **Run History** section showing:
- Status icon
- Environment name
- Start timestamp
- Status badge
- **Re-run** link → `/run?envId={env}&vars={base64vars}`

Re-run links are only shown when the flow status is `approved`.

---

## Inline Step Command Fix

After a run completes (`done` state), failed steps show an inline edit UI for their Cypress command:

1. A pencil icon appears next to the command pill
2. Clicking opens an `<Input>` pre-filled with the current `cypressCommand`
3. Enter/checkmark: calls `PATCH /flows/:flowId/steps/:stepId` with the new command, updates local state
4. Escape/× cancels without saving

### `savedEdits` ref pattern

`RunFlow.tsx` resets the `steps` state array on every run start (`handleRun` / `handleRunAgain`), rebuilding from the `stepSummaries` prop (server-rendered). Without additional handling, this would discard any inline edits made after a run.

A `savedEdits` ref (`useRef<Record<string, string>>({})`) persists command edits across state resets:

```typescript
const savedEdits = useRef<Record<string, string>>({})

const buildSteps = () =>
  stepSummaries.map((s) => ({
    ...s,
    cypressCommand: savedEdits.current[s.id] ?? s.cypressCommand,
    status: "pending" as const,
  }))

const handleCommandSaved = (stepId: string, newCommand: string) => {
  savedEdits.current[stepId] = newCommand
  setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, cypressCommand: newCommand } : s)))
}
```

`buildSteps()` is called instead of `stepSummaries.map(...)` wherever steps are reset. This ensures that previously saved edits survive "Run Again" resets.

---

## Flow Search & Filter — Frontend

Route: `/projects/[id]` (project page)

The project page passes `flows[]` to `<FlowsSection>` (client component). All filtering is client-side:

- **Search input** — case-insensitive match on `flow.name` and `flow.description`
- **Status tabs** — All / Approved / Draft / Archived

Both filters compose (search + status applied together). The header shows `(filtered/total)` count.

Component: `apps/web/src/app/projects/[id]/FlowsSection.tsx`

---

## Notes

- Runs are fire-and-forget: the HTTP handler returns after inserting the DB row. Long-running flows do not block the HTTP response.
- If the server restarts mid-run, the run stays in `running` status in DB — no auto-recovery in Stage 5.
- Screenshots are stored on local disk (not object storage). For production, `SCREENSHOT_DIR` should point to a persistent volume mount.
- Mobile screenshot PNGs are transmitted as base64 over WebSocket. At typical mobile screenshot sizes (100–500 KB), this adds ~130–660 KB to the WS message. Acceptable for MVP; consider a direct HTTP upload endpoint for large screens or high step counts.