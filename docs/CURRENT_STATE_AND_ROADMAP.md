---
title: "Current State & Roadmap"
---

# Flowright — Current State, Challenges & Roadmap

> Last updated: 2026-05-06

---

## What Is Flowright?

Flowright is an AI-driven test automation platform that converts a tester's plain-English test description into executable test flows — for both **web** (via Playwright) and **mobile** (Android/iOS via Maestro CLI) — without writing a single line of code.

**Core loop:**
```
Write test case in plain English
  → AI refines it into clean, numbered steps
  → AI generates automation code using real element data from your app
  → Tester reviews, fixes individual steps if needed, approves
  → Run against any device or environment in real time
```

---

## What's Done (as of v0.2)

### Core Infrastructure
- [x] Project + environment CRUD
- [x] 5 auth types: None, Phone+OTP+MPIN, Email+Password, SSO, Custom Script
- [x] AES-256-GCM encryption for all credentials at rest
- [x] PostgreSQL schema with Drizzle ORM
- [x] Fastify API + Next.js 15 frontend

### Web Pipeline (Playwright)
- [x] Playwright headless crawler — discovers buttons, inputs, links, selects
- [x] Pre-auth + post-auth crawl (captures login form AND post-login pages)
- [x] Gemini generation: raw text → refined NL → Cypress-like steps
- [x] Custom Cypress-to-Playwright adapter (runs generated steps without Cypress CLI)
- [x] SSO storage state injection for SSO environments
- [x] Per-step screenshots (pass and fail)
- [x] Cloud screenshot storage via Supabase Storage (with local FS fallback when env vars are absent)
- [x] Step retry loop (configurable per flow via `flows.maxRetries`, default 2 retries / 3 attempts) with `step:retry` WS event and `attempts` persisted on `stepResults`
- [x] Runtime self-healing on selector-pattern errors — re-extract live DOM, ask Gemini for replacement, retry. Healed proposals queue for human review (`selector_healings` table) — `flowSteps.command` is never auto-mutated
- [x] Self-heal review page (`/projects/:id/healings`): tabbed Pending / Accepted / Rejected with side-by-side command diff, accept-and-apply / reject
- [x] Stability-hint feedback into Gemini generation: accepted healings inform future `generateSteps` / `regenerateStep` calls (project-scoped for new flows, flow-scoped for single-step regeneration)
- [x] Re-crawl button in run viewer's failure banner — manual escape hatch when the registry has drifted
- [x] Heal telemetry — every heal attempt logs latency, element count, Gemini reasoning, and outcome (`no_proposal` / `recovered` / `failed_after_heal`) to `heal_telemetry`; `GET /healings/telemetry` and `/telemetry/summary` for measurement and prompt iteration

### Mobile Pipeline (Maestro)
- [x] `maestro hierarchy` crawler — multi-screen crawl (taps nav tabs, captures each screen, aggregates)
- [x] Flutter, React Native, native Android/iOS field name support in the crawler
- [x] Elements tagged by screen (`screen` field on `MobileSelectorEntry`)
- [x] Element registry fed to Gemini at generation time (grouped by screen in prompt)
- [x] Gemini prompt rules:
  - Buttons/tabs/menus → `tapOn` with exact text from registry
  - Icon buttons not in registry → `tapOn` with point percentage
  - Text input fields → always `tapOn` by point + `clearText` + `inputText`
  - Auth steps excluded (handled by auth subflow)
- [x] Auth subflow auto-generated and prepended to every flow (Phone+OTP+MPIN / Email+Password)
- [x] `skipAuth` flag — skips auth subflow for already-logged-in sessions
- [x] Local agent binary (macOS arm64 / x64, Linux x64) — connects via WebSocket
- [x] Per-step `takeScreenshot` injected into YAML; screenshots sent to server on failure
- [x] Multi-agent support + device selector in run UI

### Flow Lifecycle
- [x] Draft → Approved → Archived
- [x] Per-step AI regeneration (tester describes correction in plain English)
- [x] Full flow regeneration
- [x] Bulk step editor (Monaco Editor, YAML/JS language modes)
- [x] Inline command edit after a run fails

### Run Experience
- [x] Real-time WebSocket progress (`step:started`, `step:retry`, `step:healed`, `step:passed`, `step:failed`, `run:completed`)
- [x] Inline `healed` badge on step rows when runtime self-heal recovered the step
- [x] Race condition fix: step results fetched from DB on `run:completed` (not just from WS stream)
- [x] Run history (last 8 runs per flow) with one-click Re-run
- [x] Flow search + status filter on project page
- [x] Screenshot viewer per step inline in results

---

## Where We Are Now

The mobile pipeline is functional end-to-end on a real Flutter app (`com.corpusvision.bakbak.dev`):

- Crawl discovers elements across Home and all nav-reachable screens
- Gemini generates correct Maestro YAML using real element text from the registry
- Flows run on a connected Android emulator via the local agent
- Screenshots are captured on failure and visible in the UI

**Current validation status:**

| Scenario | Status | Notes |
|----------|--------|-------|
| Navigate to Profile tab | ✅ Working | Point-based tap (`90%,92%`) |
| Tap gear/settings icon | ✅ Working | Point-based tap (`90%,8%`) |
| Tap named menu item (e.g. Edit Profile) | ✅ Working | Text-based tap from registry |
| Edit text input field (e.g. Bio) | 🔄 In progress | Point-based tap + clearText + inputText — validating |
| Assert visible after navigation | ✅ Working | `assertVisible` with exact screen text |
| Skip auth on re-run | ✅ Working | Checkbox in run setup UI |
| Multi-screen registry in prompt | ✅ Working | Elements grouped by screen, fed to Gemini |

---

## Active Challenges

### 1. Deep-screen elements are not in the registry

The crawler only reaches screens accessible from the home screen via nav tabs. Screens that require navigating into (Edit Profile, Transaction Detail, Settings sub-screens) are not crawled.

**Impact**: Gemini uses point-based coordinates for elements on these screens. Coordinates are approximate and may be wrong on different device sizes.

**Planned fix**: Deep-screen crawl on demand — tester can manually navigate to a screen and trigger a "partial crawl" to capture just that screen's elements.

---

### 2. Point coordinates are device-size dependent

`tapOn: { point: "50%,70%" }` is a relative percentage, which works across screen sizes in theory. But Gemini's point estimates are just guesses — it has no knowledge of where the Bio field actually sits on the screen.

**Impact**: Generated coordinates may miss the target, especially on forms with many fields stacked vertically.

**Mitigation in place**: `clearText` before `inputText` handles the case where the field was already focused. If the tap misses entirely, the tester can edit the step coordinates manually.

**Planned fix**: Once deep-screen crawl is in, registry has real `bounds` data → use those to compute accurate percentages instead of guessing.

---

### 3. Flutter accessibility coverage depends on app code quality

Flutter renders on a canvas. If the app doesn't use `Semantics` widgets, icon buttons and image buttons have no accessibility label — `maestro hierarchy` returns nothing useful for them.

**Impact**: Icon-only buttons (gear, back arrow, hamburger menu) can only be targeted by coordinates, never by label. If the app layout changes, coordinates break silently.

**Reality**: This is a Flutter app problem, not a Flowright problem. The standard fix is adding `Semantics` to icon buttons in the app source. For apps we don't control, point-based tapping is the only option.

---

### 4. Gemini prompt instability with conflicting rules

As more edge case rules are added to the generation prompt, Gemini sometimes over-applies them (e.g. applying "input field" rules to buttons, or using point for everything after a "NEVER guess text" instruction).

**Impact**: Regressions in previously working steps when the prompt is updated.

**Approach**: Keep rules minimal and unambiguous. Separate element categories clearly (buttons vs inputs). Test prompt changes against a real flow before shipping.

---

### 5. Auth subflow is hardcoded in `auth-subflow.ts`

The current auth subflow generator produces a fixed YAML sequence based on the auth fields (phone, OTP, MPIN). It doesn't know the actual element labels of the login screen.

**Impact**: The auth subflow may fail if the login screen has different button labels or an unusual flow (e.g. phone field is not the first field, OTP timeout requires a retry button).

**Planned fix**: Crawl the login screen (before auth) and feed those selectors into a Gemini-generated auth subflow instead of the hardcoded template.

---

## Near-Term Priorities (v0.3)

| Priority | Item | Why |
|----------|------|-----|
| 🔴 High | Deep-screen crawl (manual trigger) | Fixes point-coordinate guessing for forms on inner screens |
| 🔴 High | Verify Bio update flow end-to-end | Current focus — validates input field tap strategy with real data |
| 🟡 Medium | Auth subflow from registry | Login screen elements vary per app — hardcoded template breaks for non-standard login flows |
| 🟡 Medium | User auth + team model | Can't share with a team without login |
| 🔴 High | Validate self-heal end-to-end on a real flow | Phase C/D shipped without real-world heal data. `heal_telemetry` is now in place — break a known flow deliberately, then read the recovery rate + rejection-reason breakdown before relying on the loop |
| 🟡 Medium | Heal-quality dashboard UI | Backend already exposes `/healings/telemetry/summary`; needs a project-scoped page to visualise recovery rate, latency trends, and rejection-reason breakdown |
| 🟢 Low | Trust-tier auto-accept for self-heal | After N successful uses of a healed selector without rejection, promote to silent apply. Requires accumulating heal history first |
| 🟢 Low | Per-selector stability score | Track `worked / total` per (env, selector); surface in bulk editor as flakiness signal |
| 🟢 Low | Diff-aware crawl (DOM hash per page) | Skip unchanged pages on re-crawl. Perf optimization, defer until justified by profile data |
| ✅ Done | Self-heal (web) — Phase C | Runtime heal + `selector_healings` review queue + accepted-heal hints fed into generation prompts |
| ✅ Done | Recrawl-on-demand from run viewer — Phase D | Failure banner exposes `Re-crawl` button (web only) |
| ✅ Done | Step retry (web) — Phase B | Per-flow `maxRetries` (default 2) + 500 ms backoff + `step:retry` WS event |
| ✅ Done | Cloud screenshot storage — Phase A | Supabase Storage with FS fallback; full URL stored in `stepResults.screenshotPath` |
| 🟢 Low | Remove debug logging in `parseHierarchyOutput` | Temporary — logs raw Flutter field names to confirm field mapping |

---

## Medium-Term Roadmap (v0.4–v0.5)

1. **Scheduled runs** — cron-based nightly regression per environment
2. **CI/CD webhook** — `POST /api/run/{flowId}` with API key; integrates with GitHub Actions, GitLab CI
3. **Test results dashboard** — pass rate over time, flakiness tracking, slowest steps
4. **Slack / email notifications** — on run failure or suite completion
5. **Run comparison** — diff results between two runs ("what broke between Tuesday and today?")
6. **Flow grouping into suites** — run N flows together as one regression suite

---

## Long-Term Vision (v1.0+)

| Feature | Description |
|---------|-------------|
| **AI failure diagnosis** | Instead of "Element not found", get "The Login button was renamed to Sign In" — partially landed via self-heal `reasoning` field; needs surfacing in the run viewer |
| **Change detection** | Crawler monitors app on a schedule; flags flows that may be affected by UI changes |
| **Coverage heatmap** | Visual map of which screens/flows have test coverage and which don't |
| **Natural language reports** | "12 flows ran overnight. 2 failed — the payment flow broke when the OTP screen didn't appear after entering the phone number." |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-06 | Custom Cypress-to-Playwright adapter instead of real Cypress | No extra binary; trade-off is edge case coverage (shadow DOM, iframes) |
| 2026-04-06 | Two separate Gemini calls: refine + generate | Refinement produces better NL → better steps |
| 2026-04-06 | Snapshot registry model (crawl once, reuse) | Faster generation; trade-off is stale selectors on app changes |
| 2026-04-11 | Screenshots over existing WebSocket (base64) instead of HTTP upload | No new endpoint; acceptable overhead for MVP |
| 2026-04-11 | Re-run via URL params instead of new API endpoint | Zero backend; user still reviews before confirming |
| 2026-04-11 | Mobile screenshot only on failure (not every step) | Reduces WS payload; failure screenshots are the most useful for debugging |
| 2026-04-12 | Multi-screen crawl: auto-navigate nav tabs | Home-only crawl missed most app elements; nav tabs cover ~80% of accessible screens |
| 2026-04-12 | Input fields always use point-based tapping (not label/placeholder text) | Label text is non-interactive in Flutter/RN; placeholder text is not in registry for deep screens; point is the only reliable fallback |
| 2026-04-12 | `clearText` before every `inputText` | Fields may have content from previous runs; clearText makes the step idempotent |
| 2026-04-12 | `skipAuth` flag instead of auto-detecting login state | Simple and explicit; auto-detection would require inspecting app state which is unreliable |
| 2026-04-12 | Dropped `assertWithAI` / `ai` Maestro commands | These require Maestro Cloud login — adds dependency and complexity for no clear gain at this stage |
| 2026-05-06 | Supabase Storage for screenshots (vs S3/R2) | Free tier covers POC volume; service-role uploads bypass RLS; public bucket avoids signed-URL plumbing until auth lands. Frontend helper passes through full URLs and falls back to legacy `/runner/screenshots/:runId/:filename` for old rows |
| 2026-05-06 | Step retry stored on `flows.maxRetries` (per-flow, not per-step) | Simpler config for POC; per-step granularity can be added later if needed. 500 ms backoff between attempts; `attempts` count persisted on `stepResults` for run-history visibility |
| 2026-05-06 | Self-heal scoped to web only; mobile relies on Maestro's native retry/heuristics | Web selectors are uniquely fragile (CSS class churn, DOM restructuring). Maestro's text/point matching is more resilient and doesn't benefit from the same heal loop |
| 2026-05-06 | Hybrid auto-accept for self-heal (heal at runtime, queue for human review) | Silent semantic mistakes are the worst-case for a test tool. Future trust-tier auto-accept after N successful uses of a healed selector |
| 2026-05-06 | Heal at most once per step | A step that fails twice with different errors after a heal is signal for human review, not a second AI guess |
| 2026-05-06 | Drop heals that didn't recover the step (don't queue them for review) | A failed proposal is noise — reviewers should only see proven-good fixes. Keeps the review queue high-signal |
| 2026-05-06 | Stability hints scoped to project, not environment | A heal that worked in staging is a useful signal for prod (same app under test). Environment-only scoping discards most of the signal |
| 2026-05-06 | Live DOM extraction for heal (not cached registry) | The registry is what we already had when the step was generated; if it was correct the step would have passed. Live snapshot is the only ground truth |
| 2026-05-06 | Diff-aware crawl deferred | Pure perf optimization, not correctness. Defer until profile data justifies it |
| 2026-05-06 | `heal_telemetry` table separate from `selector_healings` | The healings table only keeps proven-good fixes (queued for review). Telemetry needs every attempt — including no-proposal and failed-after-heal cases — to measure heal quality and iterate the prompt. Two tables with different retention semantics is cleaner than one table with mixed-purpose rows |
| 2026-05-06 | `proposeSelectorFix` returns granular rejection reasons (`no_text` / `parse_error` / `empty_selector` / `unchanged_command`) instead of `null` | These are distinct failure modes pointing at different prompt fixes — collapsing them to null was throwing away the most useful diagnostic signal |
