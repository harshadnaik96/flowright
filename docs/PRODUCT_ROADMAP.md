# Flowright — Product Roadmap & Strategy

## What Is Flowright?

Flowright is an AI-driven test automation platform that converts plain-English test descriptions into executable test flows using Google Gemini AI and a Playwright-based crawler.

**Core value proposition**: Lower the barrier for manual testers to create automated regression suites — without writing a single line of code.

---

## Current State (POC — v0.1)

### What's Built

| Area | Details |
|------|---------|
| Project & Environment Management | Full CRUD, 5 auth types (None, Credentials/OTP/MPIN, Email/Password, SSO, Custom Script) |
| Security | AES-256-GCM encryption for all sensitive credentials at rest |
| Playwright Crawler | Auto-discovers interactive elements, builds a `SelectorRegistry` |
| AI Flow Generation (Gemini) | Refine (raw text → clean NL) → Generate (NL + selectors → Cypress steps) → Per-step Regenerate |
| Flow Lifecycle | Draft → Approved → Archived, with inline + bulk (Monaco Editor) step editing |
| Test Runner | Custom Cypress-to-Playwright adapter with OTP handling, `Cypress.env()` resolution, screenshots per step |
| Real-time Progress | WebSocket events (`step:started`, `step:passed`, `step:failed`, `run:completed`) |
| Frontend | Next.js 15 dashboard, flow creation wizard, run viewer, bulk editor |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, shadcn/ui, Framer Motion |
| Backend | Fastify 5, TypeScript |
| Database | PostgreSQL 16, Drizzle ORM |
| Crawling & Execution | Playwright (headless Chromium) |
| AI | Google Gemini (`@google/genai`) |
| Realtime | WebSocket (`@fastify/websocket`) |
| Encryption | Node.js crypto (AES-256-GCM) |

---

## Target Users

| Persona | Description | Pain Point Solved |
|---------|-------------|-------------------|
| **Manual QA Tester** | Understands product deeply, no coding skills | Stops spending hours on repetitive regression runs |
| **Automation Engineer** | Can write code but wants speed | Scaffolds tests in minutes instead of hours |
| **QA Lead** | Wants coverage without hiring more engineers | Gets automated coverage from existing manual testers |

---

## Market Position

**The gap**: An affordable, AI-native test automation tool that a manual tester can use without an automation engineer beside them.

| Tool | Weakness |
|------|---------|
| Cypress / Playwright | Require code — manual testers can't use them |
| Testim / Mabl / Sauce Labs | Expensive enterprise pricing, steep onboarding |
| Record-and-replay tools | Brittle — break on any UI change |

**Flowright's edge**: Combines intelligent element crawling with AI-powered generation, making it resilient to UI changes and accessible to non-engineers.

> The crawler + AI generation combo is the real innovation. Everything else should protect and deepen that.

---

## Gap Analysis

### Critical (blocks production use)

| Gap | Why It Matters |
|-----|---------------|
| No user auth / multi-tenancy | Can't be used by a team safely |
| Screenshots stored locally | Won't survive a server restart; can't share results across team |
| No retry logic | Flaky tests are a reality; one failure = broken pipeline |
| Cypress adapter isn't real Cypress | iframes, shadow DOM, file uploads will break |
| Crawler is one-shot | App changes require a full manual recrawl |

### High Value (missing but needed for stickiness)

- Scheduled runs (daily/nightly regression)
- CI/CD webhook integration (trigger from GitHub Actions, GitLab CI)
- Test results dashboard (trends, flakiness, pass rate over time)
- Slack / email notifications on run completion
- Diff-aware recrawling when app UI changes

---

## Phased Roadmap

### Phase 1 — Production-Ready

> Goal: Make it safe and reliable enough for a real QA team to use daily.

1. User authentication (Clerk or Supabase Auth) + team / org model
2. Cloud screenshot storage (AWS S3 or Cloudflare R2)
3. Step retry logic (configurable — e.g. 2 retries on timeout before marking failed)
4. Scheduled runs (cron-based, configurable per environment)
5. Email + Slack notifications on run completion / failure

---

### Phase 2 — Stickiness & Integration

> Goal: Embed Flowright into the team's daily development workflow.

6. Test results dashboard — pass rate trends, flakiness tracking, coverage over time
7. CI/CD trigger API — `POST /api/run/{flowId}` with API key authentication
8. Self-healing selectors — Gemini re-identifies broken selectors on failure automatically
9. Run comparison — diff results between any two runs ("what broke between Tuesday and today?")
10. Flow grouping into test suites — run N flows together as one suite with a single trigger

---

### Phase 3 — Moat & Differentiation

> Goal: Build capabilities that no other tool offers — make Flowright irreplaceable.

11. **AI failure diagnosis** — plain-English explanation of why a step failed ("The button label changed from 'Pay' to 'Confirm Payment'")
12. **Coverage heatmap** — visual map of which parts of the app have test coverage vs. none
13. **Change detection** — crawler monitors for UI diffs on a schedule and flags flows that may be affected
14. **Record-and-replay** — alternative to AI generation for complex flows that are hard to describe in text
15. **Integrations** — Jira (link flows to tickets), TestRail, Linear, GitHub Issues

---

## Differentiating Features (Long-term Vision)

| Feature | Description |
|---------|-------------|
| Self-healing selectors | When a selector breaks, Gemini finds the new matching element automatically — no manual fix needed |
| AI failure diagnosis | Instead of "Element not found", get "The checkout button was renamed and moved to the header" |
| Flow maintenance alerts | "Your app deployed a UI change — these 3 flows may be affected. Review?" |
| Natural language run reports | "12 flows ran. 3 failed. The payment flow broke at step 4 — the OTP screen never appeared after entering the phone number." |
| Coverage suggestions | "You have no tests covering the settings or billing pages. Want me to generate some?" |

---

## Success Metrics

| Phase | Key Metric |
|-------|-----------|
| Phase 1 | A team of 3+ testers using it daily for regression |
| Phase 2 | Integrated into at least one CI/CD pipeline |
| Phase 3 | Flows self-heal without human intervention after a UI change |

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-06 | Built custom Cypress-to-Playwright adapter instead of using real Cypress | Simpler deployment, no extra binary dependencies; trade-off is edge case coverage |
| 2026-04-06 | Used Gemini for both refinement and generation in two separate prompts | Separation of concerns — refinement produces better NL, which produces better Cypress steps |
| 2026-04-06 | Crawler stores a snapshot (SelectorRegistry) rather than crawling on demand | Faster generation; trade-off is stale selectors when app changes |
