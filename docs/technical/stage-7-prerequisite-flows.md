---
title: "Prerequisite Flows — Technical Reference"
---

# Stage 7 — Technical Reference: Prerequisite Flows

## Overview

A flow may declare another flow as its prerequisite. When a run starts, the runner executes the prerequisite flow's steps first, in the same Playwright `Page` instance, before executing the main flow's steps. This allows a single Login flow to be reused across many test flows without duplicating steps or relying on pre-seeded browser state.

Scope: **web only**. Mobile flows use Maestro's native session model and don't share a browser context in the same way.

---

## Files

```
apps/api/src/
├── db/schema.ts                  flows.prerequisiteFlowId FK
├── drizzle/0001_prerequisite_flow.sql
├── routes/flows.ts               PATCH /:id — set/clear prerequisite
└── services/runner.ts            setup phase before main step loop

packages/shared/src/index.ts      Flow.prerequisiteFlowId, WsEventType additions

apps/web/src/
├── app/projects/[id]/flows/[flowId]/
│   ├── page.tsx                  fetch allFlows, render PrerequisiteSelector
│   └── PrerequisiteSelector.tsx  client component — dropdown, Save/Clear
└── app/projects/[id]/flows/[flowId]/run/
    └── page.tsx                  fetch prerequisiteFlowName, pass to RunFlow
```

---

## Database

```sql
-- Migration: apps/api/drizzle/0001_prerequisite_flow.sql
ALTER TABLE "flows"
  ADD COLUMN "prerequisite_flow_id" uuid
  REFERENCES "flows"("id") ON DELETE SET NULL;
```

```ts
// apps/api/src/db/schema.ts
import type { AnyPgColumn } from "drizzle-orm/pg-core"

export const flows = pgTable("flows", {
  // ...existing columns...
  prerequisiteFlowId: uuid("prerequisite_flow_id")
    .references((): AnyPgColumn => flows.id, { onDelete: "set null" }),
})
```

The lambda `(): AnyPgColumn => flows.id` is required to avoid a circular reference initialization error in Drizzle ORM — the table hasn't finished initializing when the FK expression is evaluated.

`ON DELETE SET NULL` ensures deleting the prerequisite flow doesn't cascade-delete the dependent flows — it just clears the link.

---

## API

### `PATCH /flows/:id`

Set or clear a flow's prerequisite.

**Body**
```json
{ "prerequisiteFlowId": "<uuid> | null" }
```

**Validation**
- Returns `400` if `prerequisiteFlowId === id` (self-reference guard)
- Circular chains (A → B → A) are not validated at this layer — the runner will time out or produce undefined behavior; circular setups should be avoided by convention

**Response**
```json
{ "flow": { ...updatedFlow } }
```

---

## Runtime — setup phase

`runner.ts` checks for a prerequisite before the main step loop:

```
runFlow(run, flow, page, ...)
  ├── if flow.prerequisiteFlowId:
  │     fetch prerequisiteFlow + prerequisiteSteps
  │     broadcast setup:started { setupFlowName, setupTotalSteps }
  │     for each prereqStep:
  │       executeStep(page, prereqStep)
  │       on failure:
  │         broadcast setup:failed { stepOrder }
  │         mark all main steps as "skipped" in DB
  │         update run.status = "failed"
  │         close browser
  │         return ← early exit, never reaches main loop
  │     broadcast setup:completed
  │
  └── main step loop (unchanged)
```

The `Page` object is the same instance throughout — cookies, localStorage, and auth tokens set during the prerequisite phase are visible to all main steps.

---

## WebSocket events

Three new event types emitted by the runner during the setup phase:

```ts
// Emitted when the prerequisite phase starts
{ type: "setup:started", runId, payload: {
    setupFlowName: string,      // name of the prerequisite flow
    setupTotalSteps: number,    // how many steps it has
}}

// Emitted when all prerequisite steps pass
{ type: "setup:completed", runId, payload: {} }

// Emitted when a prerequisite step fails
{ type: "setup:failed", runId, payload: {
    stepOrder: number,          // which step failed
}}
```

These are defined in `packages/shared/src/index.ts` under `WsEventType` and `WsEvent['payload']`.

---

## Frontend

### `PrerequisiteSelector.tsx`

Client component rendered on the flow detail page. Receives `allFlows` (all flows in the project except the current one) and the current `prerequisiteFlowId`.

- Renders a `<select>` dropdown populated from `allFlows`
- **Save** calls `api.flows.setPrerequisite(flowId, selectedId)` via `PATCH /flows/:id`
- **Clear** calls `api.flows.setPrerequisite(flowId, null)`
- Optimistic-style: on save, updates local state immediately; on error, resets and shows an error message

### `RunFlow.tsx` — setup phase UI

`RunFlow` receives `prerequisiteFlowName?: string` as a prop (fetched server-side by the run page from `flow.prerequisiteFlowId`).

**Setup form** (before run starts): if `prerequisiteFlowName` is set, renders an info box:
> "This flow requires 'Login' to run first. It will execute automatically in the same session."

**Live view** (after run starts): maintains `setupPhase: "idle" | "running" | "completed" | "failed"` state.

- `setup:started` → sets `setupPhase = "running"`, shows a blue spinner banner
- `setup:completed` → sets `setupPhase = "completed"`, banner turns green
- `setup:failed` → sets `setupPhase = "failed"`, banner turns red

The banner sits above the main step list and disappears only when dismissed manually or when the run view resets.

---

## Shared types

```ts
// packages/shared/src/index.ts

interface Flow {
  // ...
  prerequisiteFlowId?: string | null
}

type WsEventType =
  | "setup:started"
  | "setup:completed"
  | "setup:failed"
  // ...existing types

interface WsEvent {
  payload: {
    // ...existing fields
    setupFlowName?: string
    setupTotalSteps?: number
  }
}
```

---

## Design decisions

| Decision | Reason |
|----------|--------|
| Shared `Page` instance, not a new browser context | Auth cookies and tokens are stored at the page/context level. A new context would be unauthenticated. |
| Early `return` on setup failure | The main test results are meaningless if the app isn't in the expected starting state — skip rather than produce false failures |
| `ON DELETE SET NULL`, not cascade | Deleting a Login flow shouldn't silently destroy all flows that depended on it; clearing the link is safer, and the run will simply fail on its own steps if auth is missing |
| Self-reference rejected at API layer | Obvious misconfiguration that the UI can't prevent if someone uses the API directly |
| No circular chain validation | Detecting cycles requires a graph traversal on every PATCH — deferred; the practical risk is low since prerequisite chains are set by humans intentionally |
| Web only | Maestro's session model is device-centric; mobile auth persistence works differently and isn't covered by this feature |

---

## Future work

- **Circular chain detection** — detect and reject A → B → A at `PATCH` time with a graph traversal
- **Multi-level chains** — allow prerequisite of a prerequisite (currently only one level is followed)
- **Mobile equivalent** — session persistence for Maestro via state file or a dedicated "setup script" concept
- **Shared session pool** — cache a logged-in browser context and reuse it across concurrent runs to avoid re-running login for every parallel execution
