---
title: "Mobile Implementation Plan"
---

# Implementation Plan: Mobile Testing (Maestro) alongside Web (Playwright)

## Decision Summary

Keep Playwright for web testing. Add Maestro CLI for mobile (Android/iOS) testing.
Both pipelines coexist under the same API, DB schema, and frontend — differentiated by a `platform` field on the project.

**Why not Maestro for web?** Maestro web is Beta, Chromium-only, and the existing Playwright web runner has non-trivial SPA handling (nav priority, OTP split inputs, SSO storageState) that is not worth rewriting for an unproven replacement.

**Why Maestro for mobile?** No equivalent alternative. Maestro handles iOS + Android natively with declarative YAML, built-in flakiness tolerance, and video recording out of the box.

---

## Architecture

```
Project platform = "web"
  Crawl   → Playwright DOM crawler        → SelectorEntry[] (CSS selectors)
  Generate → generateSteps()              → Cypress command → stored in `command` column
  Run     → runner.ts (Playwright)        → Screenshots + WebSocket events

Project platform = "android" | "ios"
  Crawl   → maestro hierarchy parser     → SelectorEntry[] (accessibility IDs / text)
  Generate → generateMaestroSteps()      → Maestro YAML   → stored in `command` column
  Run     → runner-maestro.ts (CLI)      → MP4 + Screenshots + WebSocket events
```

Same DB shape. Same API routes. Same frontend UI. Platform-aware only at the service layer.

---

## Pre-Implementation Fixes (Do These First)

These must be completed before any mobile code is written.

### 1. Rename `cypressCommand` → `command` everywhere

The column name `cypress_command` is web-specific and will be misleading once mobile flows exist.

**Files to update:**
- `apps/api/src/db/schema.ts` — rename column, update DB migration
- `packages/shared/src/index.ts` — `FlowStep.cypressCommand` → `command`, `BulkUpdateStepItem.cypressCommand` → `command`
- `apps/api/src/services/runner.ts` — references to `step.cypressCommand`
- `apps/api/src/services/gemini.ts` — `GeneratedStep.cypressCommand`, prompt output schema
- `apps/api/src/routes/generator.ts` — any field mapping
- `apps/api/src/routes/flows.ts` — bulk update handler
- `apps/web/src/` — any frontend references to `cypressCommand`

### 2. Add `platform` to projects table

```ts
// schema.ts
export const platformEnum = pgEnum("platform", ["web", "android", "ios"]);

export const projects = pgTable("projects", {
  // ... existing fields
  platform: platformEnum("platform").default("web").notNull(),
});
```

Update `packages/shared/src/index.ts`:
```ts
export type Platform = "web" | "android" | "ios";

export interface Project {
  // ... existing fields
  platform: Platform;
}
```

Update `CreateProjectRequest` to include `platform`.

### 3. Plan SelectorEntry mobile variant

Current `SelectorEntry` is web-DOM-specific (`selector` = CSS selector, `pageUrl` = URL, `placeholder`).
For mobile, `maestro hierarchy` provides accessibility IDs, resource IDs, and text content — not CSS selectors.

Options:
- **Union type** (recommended): `SelectorEntry` stays, add `MobileSelectorEntry` with `resourceId`, `accessibilityId`, `text`, `bounds`
- **Extended interface**: Add optional mobile fields to existing `SelectorEntry` and use `platform` to know which fields are populated

Decision: Use a union type. Keep web and mobile selector shapes distinct and clearly typed.

### 4. Confirm Java 17 in deployment environment

Maestro CLI requires Java 17+. Verify this is available (or installable) in your Docker/server environment before committing to the mobile pipeline.

Check: `java -version` on the deployment host. If not present, add to `Dockerfile`.

---

## What to Keep Untouched (Web Pipeline)

| File | Reason |
|------|--------|
| `services/runner.ts` | Solid Playwright web runner — SPA nav, OTP, SSO, humanized errors |
| `services/crawler.ts` | Playwright DOM crawler works correctly |
| `services/gemini.ts` → `generateSteps()` | Web-specific Cypress generation — keep as-is |
| `services/gemini.ts` → `refineTestCase()` | Platform-agnostic — shared by both pipelines |
| `services/gemini.ts` → `regenerateStep()` | Web-specific — keep, add mobile parallel later |
| `services/encryption.ts` | Not platform-specific |
| All existing routes | Add platform guards, don't restructure |

---

## What to Add (Mobile Pipeline)

### `services/gemini-maestro.ts` (new file)

New function `generateMaestroSteps()` — parallel to `generateSteps()`, different prompt.

Key prompt differences:
- Role: "You are a Maestro mobile automation engineer"
- Output format: Maestro YAML steps (`tapOn`, `inputText`, `assertVisible`, etc.)
- Variable format: `${VARIABLE_NAME}` instead of `Cypress.env('key')`
- No CSS selectors — use visible text and accessibility IDs from registry
- Auth variables: `${PHONE}`, `${OTP}`, `${MPIN}`, `${EMAIL}`, `${PASSWORD}`

Output schema per step:
```json
{
  "order": 1,
  "plainEnglish": "Tap the Login button",
  "command": "- tapOn: \"Login\"",
  "selectorUsed": "Login"
}
```

### `services/crawler-maestro.ts` (new file)

Runs `maestro hierarchy` via child process, parses the accessibility tree output, and builds `MobileSelectorEntry[]`.

```ts
import { spawn } from 'child_process'

export async function crawlMobileApp(appId: string): Promise<MobileSelectorEntry[]> {
  // spawn: maestro hierarchy
  // parse stdout → extract elements with text, accessibilityId, resourceId
  // return MobileSelectorEntry[]
}
```

### `services/runner-maestro.ts` (new file)

Spawns `maestro test <flow.yaml>`, parses stdout line-by-line, and emits WebSocket events.

```ts
import { spawn } from 'child_process'

export async function startMobileRun(runId: string): Promise<void> {
  // 1. Load run, steps, environment from DB
  // 2. Write steps to a temp Maestro YAML file
  // 3. spawn: maestro test <file.yaml> --env KEY=VALUE
  // 4. Parse stdout → broadcast WebSocket events (step:started, step:passed, step:failed)
  // 5. On process close → mark run complete / failed
}
```

Maestro stdout pattern to parse (approximate):
```
✅  Tap on "Login"
❌  Assert visible "Dashboard" — Element not found
```

### Auth Subflow Generation

For mobile environments with auth configured, auto-generate a Maestro subflow YAML at crawl time:

```yaml
# subflows/env-{id}-auth.yaml  (auto-generated)
appId: "${APP_ID}"
---
- tapOn: "Login"
- inputText: "${PHONE}"
- tapOn: "Get OTP"
- inputText: "${OTP}"
- tapOn: "Submit"
```

Every generated mobile flow begins with:
```yaml
- runFlow:
    path: ./subflows/env-{id}-auth.yaml
    params:
      PHONE: "${PHONE}"
      OTP: "${OTP}"
```

Store the subflow path in `environments` table (new `authSubflowPath` column, nullable).

---

## DB Migration Plan

### Migration 1: Rename `cypress_command` → `command`
```sql
ALTER TABLE flow_steps RENAME COLUMN cypress_command TO command;
```

### Migration 2: Add `platform` to `projects`
```sql
CREATE TYPE platform AS ENUM ('web', 'android', 'ios');
ALTER TABLE projects ADD COLUMN platform platform NOT NULL DEFAULT 'web';
```

### Migration 3: Add `auth_subflow_path` to `environments` (optional, mobile only)
```sql
ALTER TABLE environments ADD COLUMN auth_subflow_path text;
```

---

## Route Changes (Platform Guards)

All runner and generator routes check `project.platform` and delegate:

```ts
// routes/runner.ts
const project = await getProjectForFlow(flowId);

if (project.platform === 'web') {
  await startRun(runId);           // existing Playwright runner
} else {
  await startMobileRun(runId);     // new Maestro runner
}
```

```ts
// routes/generator.ts
if (project.platform === 'web') {
  result = await generateSteps(refined, registry, flowName);
} else {
  result = await generateMaestroSteps(refined, mobileRegistry, flowName, project.platform);
}
```

```ts
// routes/crawler.ts
if (project.platform === 'web') {
  entries = await crawlEnvironment(env);       // existing Playwright crawler
} else {
  entries = await crawlMobileApp(env.appId);   // new Maestro hierarchy crawler
}
```

---

## Frontend Changes

### Project Creation (`projects/new/page.tsx`)
Add platform selector step:
```
[ Web ] [ Android ] [ iOS ]
```
Pass `platform` in `CreateProjectRequest`.

### Environment Form (`environments/new/page.tsx`)
- Web: show `baseUrl` field (existing)
- Mobile: show `appId` field (package name, e.g. `com.example.app`) + device/emulator setup instructions

### Flow Wizard (`flows/new/page.tsx`)
- No changes to the wizard steps
- The Steps panel shows YAML for mobile, Cypress commands for web (bulk editor syntax changes)

### Bulk Editor (`flows/[id]/bulk-edit/page.tsx`)
- Web: Monaco with `javascript` language mode (existing)
- Mobile: Monaco with `yaml` language mode

### Run View (`flows/[id]/run/page.tsx`)
- Add video player component for mobile runs (Maestro outputs MP4)
- Screenshots still shown per step for both platforms

---

## Implementation Order

1. ✅ **Pre-fixes** (rename `cypressCommand`, add `platform`, fix model name, define mobile types)
2. ✅ **DB migrations** (apply schema changes)
3. ~~**`generateMaestroSteps()`** in gemini service~~ (removed — redundant)
4. ✅ **`crawlMobileApp()`** using `maestro hierarchy`
5. ✅ **Auth subflow generation** from environment config
6. ✅ **`startMobileRun()`** runner with WebSocket events
7. ✅ **Route platform guards** (delegate to correct service per platform)
8. ✅ **Frontend platform picker** on project creation
9. ✅ **Frontend mobile adaptations** (appId field, YAML bulk editor; video player deferred — no backend video endpoint yet)
10. **End-to-end test** on a real Android emulator

---

## MVP Feature Additions (v0.2)

Implemented after the core mobile pipeline was validated:

| Feature | Status | Details |
|---------|--------|---------|
| Mobile screenshots on failure | ✅ | `takeScreenshot` injected per step in YAML; agent reads PNG, sends base64 with `step:failed`; API saves and serves via `/runner/screenshots/` |
| Device / agent selection | ✅ | `AgentConnection.name` stored; `GET /runner/agents`; optional `agentId` in `POST /runner`; radio selector in run UI |
| Run history & re-run | ✅ | Flow detail page shows last 8 runs; Re-run link encodes `envId` + `vars` in URL params; run page decodes and pre-fills form |
| Flow search & filter | ✅ | `FlowsSection` client component with live search + status tabs on project page |

---

## Key Trade-offs Accepted

| Trade-off | Decision |
|-----------|----------|
| Two step formats (Cypress-like vs Maestro YAML) | Accepted — both stored in `command` column, platform determines interpretation |
| Java 17 runtime dependency for mobile | Accepted — isolated to mobile runner only |
| Maestro web is Beta | Not used — Playwright handles web |
| No Maestro REST API (must spawn CLI) | Accepted — stdout parsing for WebSocket events |
| Maestro Chromium-only for web | Not relevant — Playwright used for web |
| Split `SelectorEntry` types | Accepted — union type, no forcing mobile selectors into web shape |

---

## Files Created / Modified Summary

| File | Action |
|------|--------|
| `apps/api/src/db/schema.ts` | Add `platformEnum`, `platform` column to projects, rename `cypress_command` → `command`, add `auth_subflow_path` |
| `packages/shared/src/index.ts` | Add `Platform` type, update `Project`, rename `cypressCommand` → `command`, add `MobileSelectorEntry` |
| `apps/api/src/services/gemini.ts` | Rename `cypressCommand` field in types/prompt, fix model name |
| `apps/api/src/services/gemini-maestro.ts` | **NEW** — `generateMaestroSteps()` |
| `apps/api/src/services/runner.ts` | Rename `step.cypressCommand` → `step.command` |
| `apps/api/src/services/runner-maestro.ts` | **NEW** — `startMobileRun()` |
| `apps/api/src/services/crawler-maestro.ts` | **NEW** — `crawlMobileApp()` |
| `apps/api/src/routes/runner.ts` | Add platform guard |
| `apps/api/src/routes/generator.ts` | Add platform guard |
| `apps/api/src/routes/crawler.ts` | Add platform guard |
| `apps/web/src/app/projects/new/page.tsx` | Add platform picker |
| `apps/web/src/app/projects/[id]/environments/new/page.tsx` | Add `appId` field for mobile |
| `apps/web/src/components/flow/BulkEditor/` | Switch Monaco language mode by platform |
| `apps/web/src/components/flow/RunFlow.tsx` | Add video player for mobile runs |
| `apps/web/src/lib/api.ts` | Update types to match renamed fields |