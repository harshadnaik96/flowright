# Stage 4 — Technical Reference: Review UI

## Overview
The Next.js 15 frontend that testers use to write, refine, generate, and approve test flows. All state during the new flow creation lives client-side until the final approve step persists it to the API.

---

## New Files

```
apps/web/src/
├── lib/
│   └── api.ts                          Typed fetch wrapper for all API calls
├── components/
│   ├── ui/                             shadcn/ui primitives (manual)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── badge.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   └── skeleton.tsx
│   ├── layout/
│   │   └── AppShell.tsx                Header + nav wrapper
│   └── flow/
│       ├── WritePanel.tsx              Panel 1 — raw input + refine
│       ├── RefinePanel.tsx             Panel 2 — refined NL review + edit
│       ├── StepsPanel.tsx              Panel 3 — step list + variables + approve
│       └── StepRow.tsx                 Single step with inline fix
└── app/projects/[id]/flows/[flowId]/
    ├── FlowActions.tsx                 Edit + Delete buttons (client component)
    └── edit/
        └── page.tsx                    Edit flow — same 3-panel wizard, re-generates existing flow
apps/api/src/routes/
└── flows.ts                            CRUD for flows + steps
```

---

## Pages

| Route | Type | Description |
|-------|------|-------------|
| `/` | Server | Dashboard — list all projects |
| `/projects/new` | Client | Create project form |
| `/projects/[id]` | Server | Project detail — environments + flows list |
| `/projects/[id]/flows/new` | Client | New flow — 3-panel wizard |
| `/projects/[id]/flows/[flowId]` | Server | Flow detail — steps + Edit/Delete actions |
| `/projects/[id]/flows/[flowId]/edit` | Client | Edit flow — same 3-panel wizard, calls `regenerate-flow` |

---

## Three-Panel Flow Creation

All three panels live on a single page (`/projects/[id]/flows/new`). Panel transitions are controlled by local React state — no page navigation between panels.

```
Panel state: "write" | "refine" | "steps"
```

State held at the page level and passed down as props:
- `flowName`, `rawInput`, `environmentId` — write panel
- `refinedText` — refine panel
- `steps[]`, `variables[]`, `flowId` — steps panel

### Panel Transitions
```
write  →[Refine API call]→  refine
refine →[back button]→      write
refine →[Generate API call]→ steps
steps  →[back button]→       refine
steps  →[Approve API call]→  /flows/[id] (redirect)
```

---

## StepRow Inline Fix

Each step has a hidden edit button (visible on hover). Clicking it shows an inline Input where the tester types a plain-English correction. On submit, the page calls `/generator/regenerate-step/:flowId` and replaces only that step in the local state array. No full regeneration.

---

## FlowActions Component

`FlowActions` is a client component rendered in the flow detail page header. It provides:

- **Edit button** — `Link` to `/projects/[projectId]/flows/[flowId]/edit`
- **Delete button** — inline confirmation banner (no dialog library required)

Delete flow confirmation uses a local `confirming` boolean state. On confirm, calls `DELETE /flows/:id`, then `router.push` back to the project page.

> Note: `AlertDialog` from shadcn/ui is not installed. Confirmation UI is implemented inline with `border-destructive/40 bg-destructive/5` styling.

---

## Edit Flow Page

Route: `/projects/[id]/flows/[flowId]/edit`

Identical to `new/page.tsx` in panel structure, with two differences:

1. **Pre-fill on mount**: Fetches existing flow via `api.flows.get(flowId)` and sets `flowName` and `rawInput` from `flow.name` and `flow.rawTestCase`.
2. **Generate calls `regenerate-flow`**: Instead of `api.generator.generate({...})`, it calls `api.generator.regenerateFlow(flowId, { refinedTestCase, rawTestCase, environmentId, flowName })` which clears existing steps and run history before inserting fresh ones.

After approve, redirects to the flow detail page. The `flowId` is unchanged.

---

## New API Endpoints (flows.ts)

| Method | Path | Description |
|--------|------|-------------|
| `DELETE` | `/flows/:id` | Delete flow — removes testRuns (cascades to stepResults), flowSteps, then the flow |
| `PATCH` | `/flows/:flowId/steps/:stepId` | Update a single step's `cypressCommand` and optional `selectorUsed` |

### DELETE /flows/:id — cascade order

FK constraint: `stepResults.stepId → flowSteps.id` (no cascade). Safe deletion order:
1. `DELETE testRuns WHERE flowId = :id` — cascades to `stepResults` via its own FK cascade
2. `DELETE flowSteps WHERE flowId = :id`
3. `DELETE flows WHERE id = :id`

### PATCH /flows/:flowId/steps/:stepId — request body
```json
{
  "cypressCommand": "cy.get('#email').should('be.visible')",
  "selectorUsed": "#email"
}
```

---

## API Client (`src/lib/api.ts`)

Typed wrapper around `fetch`. Base URL from `NEXT_PUBLIC_API_URL`. All methods return typed responses from `@flowright/shared` types. 204 responses return `undefined`.

New methods added:
- `api.flows.delete(flowId)` — calls `DELETE /flows/:id`, returns `undefined`
- `api.flows.updateStep(flowId, stepId, body)` — calls `PATCH /flows/:flowId/steps/:stepId`
- `api.generator.regenerateFlow(flowId, body)` — calls `POST /generator/regenerate-flow/:flowId`

---

## Next.js 15 Notes

- All page params are `Promise<{ ... }>` — awaited with `await params` in server components or `use(params)` in client components
- Server components fetch directly via the `api` client (server-side fetch, no client bundle overhead)
- Client components marked with `"use client"` at the top
- API rewrites in `next.config.ts` proxy `/api/*` to Fastify in development
