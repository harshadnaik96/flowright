---
title: "Self-Healing Selectors"
---

# Stage 6 — Technical Reference: Self-Healing Selectors (Web)

## Why this exists

The crawler builds a `SelectorRegistry` once per environment. Real apps drift between crawls — `data-testid="submit"` becomes `data-testid="confirm"`, a button text changes, a sidebar gets restructured. Without intervention, every flow that touched the changed element fails until somebody manually re-crawls and regenerates.

Self-heal closes that loop at runtime. When a step fails on a selector-pattern error, the runner re-extracts the live DOM, asks Gemini for a replacement command, and retries with the new command. If the heal recovers the step, the proposal lands in a human review queue — the original `flowSteps.command` is **never** mutated automatically.

Scope: **web only**. Maestro's text/point matching is far less brittle than CSS selectors and doesn't benefit from the same loop.

---

## Files

```
apps/api/src/
├── services/
│   ├── self-heal.ts              isSelectorPatternError, healSelector, getStabilityHints
│   ├── crawler.ts                exports extractElements() (re-used by self-heal)
│   ├── gemini.ts                 proposeSelectorFix(), buildStabilityHintsBlock()
│   └── runner.ts                 retry loop calls healSelector once per failed step
└── routes/
    └── healings.ts               GET /healings, POST /healings/:id/{accept,reject}

apps/web/src/
├── app/projects/[id]/healings/
│   ├── page.tsx                  Server component — fetches pending/accepted/rejected
│   └── HealingsBoard.tsx         Client — tabbed list, accept/reject mutations
└── components/flow/
    └── RunFlow.tsx               Listens for step:healed, renders "healed" badge live
```

---

## Database

```ts
// apps/api/src/db/schema.ts
selector_healings (
  id              uuid pk
  run_id          uuid → test_runs.id    (cascade delete)
  step_id         uuid → flow_steps.id   (cascade delete)
  flow_id         uuid → flows.id        (cascade delete)
  original_command   text
  healed_command     text
  original_selector  text          -- nullable; parsed from cy.get(...) / cy.contains(...)
  healed_selector    text          -- nullable
  error_message      text
  screenshot_path    text          -- post-heal screenshot (Supabase URL or relative path)
  status             healing_status   -- 'pending' | 'accepted' | 'rejected'
  healed_at          timestamp
  reviewed_at        timestamp
)

step_results.was_healed  boolean   -- new column; true when the recovering attempt used a healed command
```

A row is inserted only when the healed command **succeeds**. Failed heals (didn't recover the step) are dropped — no review burden.

---

## Runtime pipeline

```
runner.ts retry loop (per step)
  ┌───────────────────────────────────────────────────────────────┐
  │ for attempt = 1 .. (1 + flow.maxRetries):                     │
  │   try executeStep(activeCommand)                              │
  │   on success → break                                          │
  │   on first failure (and only first):                          │
  │     if isSelectorPatternError(err):                           │
  │        live = extractElements(page, page.url())               │
  │        proposal = await proposeSelectorFix(...)               │
  │        if proposal:                                           │
  │          activeCommand = proposal.healedCommand               │
  │          broadcast step:healed                                │
  │   broadcast step:retry                                        │
  │   sleep(500ms)                                                │
  │                                                               │
  │ after loop:                                                   │
  │   if status == passed AND healPending exists:                 │
  │     stepResults.was_healed = true                             │
  │     INSERT selector_healings (status='pending')               │
  │   else if status == failed:                                   │
  │     drop healPending — only successful heals get reviewed    │
  └───────────────────────────────────────────────────────────────┘
```

### `isSelectorPatternError`

Triggers heal only on signatures that *could* be selector drift, not on assertion failures or app-state errors:

```
/Timeout.*exceeded/i
/not found/i
/strict mode violation/i
/resolved to 0 elements/i
/waiting for .* to be (visible|attached|hidden)/i
/Could not (click|type|check|select)/i
/was not found on the page/i
```

### `extractElements(page, url)`

Re-uses the crawler's element extraction. Imported and re-exported from `crawler.ts:extractElements`. Critical: this runs **against the page that just failed**, not against the stored registry. If the registry was crawled an hour ago and the app has drifted since, the live snapshot is the only ground truth.

### `proposeSelectorFix`

Located in `gemini.ts`. Given:
- failed command
- humanized error
- step's plain-English intent
- live DOM snapshot (top 200 elements)

Returns `{ healedCommand, healedSelector, reasoning }` or `null`. Rejects:
- empty proposals
- proposals identical to the original command
- proposals with empty healed selector

The prompt explicitly instructs Gemini to keep the Cypress verb shape identical and only swap the selector — it must not reinterpret a click as a type, etc.

### `extractSelectorFromCommand`

Best-effort regex parse to pull the primary selector argument out of `cy.get(...)` or `cy.contains(...)` for audit-table storage. Used so reviewers see the original vs healed selector at a glance.

---

## Stability hints — feedback loop into generation

`getStabilityHints(projectId)` and `getStabilityHintsForFlow(flowId)` query **accepted** healings and return them as a compact list:

```ts
{
  intent: "Click the Sign In button",
  preferSelector:  '[data-testid="signin"]',
  avoidSelector:   '[data-testid="submit"]',
  exampleCommand:  'cy.get(\'[data-testid="signin"]\').click()'
}
```

Threaded into all three generator routes:

| Route | Hint scope |
|-------|-----------|
| `POST /generator/generate` | project-scoped — broadest |
| `POST /generator/regenerate-flow/:flowId` | project-scoped |
| `POST /generator/regenerate-step/:flowId` | flow-scoped — tighter signal for one fix |

`gemini.ts:buildStabilityHintsBlock` injects them as a JSON block above the rules section. Mobile generation does not use hints — selectors aren't the failure mode there.

> **Why scope to project, not environment?** A heal that worked in staging is a useful signal for prod (same app under test). Environment-only scoping would discard most of the signal.

---

## Review API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/healings?projectId&flowId&status` | List with flow + step joined for display |
| `POST` | `/healings/:id/accept` | Mark accepted; if `applyToFlow=true` (default), write `healed_command` back to `flow_steps.command` and `flow_steps.selector_used` |
| `POST` | `/healings/:id/reject` | Mark rejected; flow_steps untouched |

Accept is idempotent on the healing row but mutates flow_steps once. Rejecting a healing that was already accepted is a 400.

---

## WebSocket events

```ts
// step:healed — emitted between attempts when a heal is applied
{ type: "step:healed", runId, payload: {
    stepOrder, plainEnglish,
    originalSelector?, healedSelector?,
    attempt, maxAttempts,
}}

// step:passed — payload now also carries heal metadata when wasHealed
{ type: "step:passed", runId, payload: {
    ..., healedSelector?, originalSelector?,
}}
```

The run viewer listens for `step:healed` and renders a yellow `healed` badge on the step row, with the selector diff in the tooltip. The badge persists into the final state if the step ultimately passes.

---

## Recrawl from the run viewer

When a run fails on web, the failure banner exposes a **Re-crawl** button next to **Run Again**. It calls `POST /crawler/crawl` for the run's environmentId, shows a spinner, then reports `Re-crawled N elements`. The button is hidden for mobile (Maestro doesn't use the registry the same way).

This is the manual escape hatch when:
- the heal loop didn't propose anything (e.g. element genuinely removed)
- generation needs to be redone with fresh registry data
- the tester knows the page was restructured

---

## Design decisions

| Decision | Reason |
|----------|--------|
| Heal at most once per step | A step that fails twice with different errors after a heal is signal for human review, not a second AI guess |
| Don't auto-mutate `flow_steps.command` | Silent semantic mistakes are the worst-case for a test tool. Every applied heal goes through human review |
| Drop heals that didn't recover the step | A failed proposal is noise — reviewers should only see proven-good fixes |
| Extract from live DOM, not the cached registry | The registry is what we already had when the step was generated; if it was correct the step would have passed |
| Limit live elements payload to 200 | Keeps Gemini latency + cost bounded on dense pages |
| Project-scoped stability hints | Same app under test, multiple envs — heals transfer; environment-only scope discards most of the signal |
| Heal logic skipped for mobile | Maestro's text/point matching tolerates more drift; selectors aren't the failure mode |

---

## Future work (not yet implemented)

- **Trust tier auto-accept** — once a healed selector has succeeded N times across runs without rejection, promote it from "pending" to silently applied.
- **Per-selector stability score** — `worked / total` count per (env, selector); surface in the bulk editor so testers see which selectors are flaky before a run.
- **Diff-aware crawl** — DOM hash per page to skip unchanged pages on re-crawl. Pure perf optimization; deferred until profile data justifies it.
- **Heal latency telemetry** — `proposeSelectorFix` adds a Gemini round-trip mid-test; for slow apps the 10s click timeout may pre-empt useful heal time. Worth measuring before tuning.
