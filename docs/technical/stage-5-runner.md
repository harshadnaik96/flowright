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
| `GET` | `/runner?flowId=` | List runs for a flow |
| `GET` | `/runner/:runId` | Get run with `stepResults[]` |
| `GET` | `/runner/ws/:runId` | WebSocket — live progress stream |
| `GET` | `/runner/screenshots/:runId/:filename` | Serve PNG screenshot |

### POST /runner — Request body
```json
{
  "flowId": "uuid",
  "environmentId": "uuid",
  "runtimeVariables": { "phone_number": "9999999999" }
}
```

### POST /runner — Response
```json
{ "runId": "uuid" }
```
Returns immediately. Execution runs asynchronously. Connect to WebSocket before or right after.

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
  4. mkdir /tmp/flowright-runs/{runId}/
  5. Update run status → "running"
  6. Broadcast run:started
  7. Launch headless Chromium
  8. Inject SSO storage state (if auth.type === "sso")
  9. For each step:
     a. Broadcast step:started
     b. executeStep(page, cypressCommand, envVars)
     c. page.screenshot({ path: "step-N.png" })
     d. Insert stepResults row
     e. Broadcast step:passed or step:failed
     f. If failed → insert remaining steps as "skipped", break
  10. Update run status → "passed" | "failed"
  11. Broadcast run:completed
```

---

---

## Mobile Runner (`runner-maestro.ts`)

`startMobileRun(runId)` handles mobile flows:

```
startMobileRun(runId):
  1. Load run + steps + environment from DB
  2. Decrypt environment auth
  3. Write all step commands to a temp Maestro YAML file
     (prepend runFlow: auth subflow if auth_subflow_path set)
  4. spawn: maestro test <file.yaml> --env KEY=VALUE
  5. Parse stdout line-by-line:
     ✅  Tap on "Login"   → step:passed
     ❌  Assert visible…  → step:failed
  6. Broadcast WS events matching the web runner event schema
  7. On process close → mark run completed / failed
```

Maestro stdout patterns parsed:
```
✅  <step description>   → step:passed
❌  <step description>   → step:failed
```

The same `WsEvent` schema is used for both web and mobile runs. The frontend `RunFlow.tsx` component handles both without platform-specific branching.

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

All events conform to `WsEvent` from `@flowright/shared`:

| Event type | Payload fields |
|------------|---------------|
| `run:started` | `totalSteps` |
| `step:started` | `stepOrder`, `plainEnglish` |
| `step:passed` | `stepOrder`, `plainEnglish`, `screenshotPath` |
| `step:failed` | `stepOrder`, `plainEnglish`, `screenshotPath`, `errorMessage` |
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

- Stored at `{SCREENSHOT_DIR}/{runId}/step-{order}.png`
- Default `SCREENSHOT_DIR`: `/tmp/flowright-runs`
- `screenshotPath` in DB/events: `"{runId}/step-{order}.png"` (relative)
- Full URL: `GET /runner/screenshots/{runId}/step-{order}.png`

Screenshots are taken after each step (pass or fail). If the screenshot call itself fails, the step result is still recorded — screenshot failure is non-fatal.

---

## Environment Variables

| Var | Description |
|-----|-------------|
| `SCREENSHOT_DIR` | Where screenshots are stored (default: `/tmp/flowright-runs`) |

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

The server component fetches the flow + environments and passes them to `<RunFlow>`. All interactivity is in the client component.

### RunFlow state machine

```
setup    → user fills variables + picks environment
starting → POST /runner fires
running  → WS connected, steps update live
done     → final banner + screenshots revealed
```

The step list is rendered throughout. In `running` state, steps show spinners → checkmarks/Xs as WS events arrive. In `done` state, each step exposes a "View screenshot" toggle.

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

## Notes

- Runs are fire-and-forget: the HTTP handler returns after inserting the DB row. Long-running flows do not block the HTTP response.
- If the server restarts mid-run, the run stays in `running` status in DB — no auto-recovery in Stage 5.
- Screenshots are stored on local disk (not object storage). For production, `SCREENSHOT_DIR` should point to a persistent volume mount.
