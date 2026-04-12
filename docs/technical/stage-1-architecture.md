---
title: "Architecture Overview"
---

# Stage 1 — Technical Reference: Project Architecture

## Overview
Flowright is a deployed web application that converts plain-English test cases into automated tests. It supports two platforms: **web** (Playwright + Cypress-style commands) and **mobile** (Android/iOS via Maestro CLI). It is a pnpm monorepo with two apps and one shared package.

---

## Repository Structure

```
flowright/
├── apps/
│   ├── web/               Next.js 15 + TypeScript + Tailwind + shadcn/ui
│   └── api/               Fastify 5 + TypeScript
├── packages/
│   └── shared/            Shared TypeScript types (no runtime deps)
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

---

## Tech Stack

| Layer       | Technology                        | Version  |
|-------------|-----------------------------------|----------|
| Frontend    | Next.js, TypeScript, Tailwind CSS, shadcn/ui | 15.x |
| Backend     | Fastify                           | 5.x      |
| LLM         | Google Gemini via `@google/genai` | latest   |
| Web Crawler | Playwright (headless Chromium)    | 1.49.x   |
| Web Runner  | Playwright (Cypress-to-Playwright transpiler) | — |
| Mobile Crawler | Maestro CLI (`maestro hierarchy`) | latest |
| Mobile Runner | Maestro CLI (`maestro test`)    | latest   |
| Database    | PostgreSQL + Drizzle ORM          | PG 16    |
| Realtime    | WebSocket via `@fastify/websocket`| —        |
| Deployment  | Docker + Docker Compose           | —        |

> Mobile runner requires **Java 17+** in the deployment environment (Maestro CLI dependency).

---

## Shared Types (`packages/shared`)

All cross-boundary types live here. Neither `web` nor `api` define their own entity types — they import from `@flowright/shared`.

Key types:

| Type | Description |
|------|-------------|
| `Platform` | `"web" \| "android" \| "ios"` |
| `Project` | Top-level grouping of flows and environments; includes `platform` field |
| `Environment` | A named target within a project; `baseUrl` holds the app URL (web) or package name (mobile) |
| `SelectorRegistry` | Crawled element map for an environment |
| `SelectorEntry` | Single web element: label, CSS selector, type, page |
| `MobileSelectorEntry` | Single mobile element: `text`, `accessibilityId`, `resourceId`, `bounds` |
| `Flow` | A named test case with status (draft/approved/archived) |
| `FlowStep` | One step within a flow: plain English + `command` (Cypress-style for web, Maestro YAML for mobile) |
| `TestRun` | An execution of a flow against an environment |
| `StepResult` | Per-step outcome with screenshot and error detail |
| `WsEvent` | WebSocket event emitted during a test run |

---

## Database Schema (Drizzle ORM)

Tables: `projects`, `environments`, `selector_registries`, `flows`, `flow_steps`, `test_runs`, `step_results`

Notable columns:
- `projects.platform` — `platform` enum: `web | android | ios` (default `web`)
- `environments.base_url` — stores app URL for web, package name (e.g. `com.example.app`) for mobile
- `environments.auth_subflow_path` — nullable; path to auto-generated Maestro auth subflow YAML for mobile environments
- `flow_steps.command` — stores Cypress-style command for web, Maestro YAML line for mobile

Relationships:
```
projects
  └── environments
        └── selector_registries (one per crawl, latest used)
  └── flows
        └── flow_steps
              └── step_results (per test_run)
        └── test_runs
              └── step_results
```

Migrations managed by Drizzle Kit:
```bash
pnpm --filter @flowright/api exec drizzle-kit generate
pnpm --filter @flowright/api exec drizzle-kit migrate
```

---

## API Architecture (Fastify)

- Runs on port `3001`
- CORS restricted to `WEB_URL` env var
- WebSocket support via `@fastify/websocket`
- Routes namespaced by feature: `/projects`, `/crawler`, `/generator`, `/runner`
- Logging via pino-pretty in dev

---

## Frontend Architecture (Next.js 15)

- App Router with TypeScript
- Tailwind CSS + shadcn/ui for components
- All `/api/*` requests proxied to Fastify via `next.config.ts` rewrites
- `@flowright/shared` imported directly for types (no runtime bundle impact)

---

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATABASE_URL` | API | PostgreSQL connection string |
| `GEMINI_API_KEY` | API | Google Gemini API key |
| `PORT` | API | API server port (default 3001) |
| `WEB_URL` | API | CORS allowed origin |
| `NEXT_PUBLIC_API_URL` | Web | Base URL for API calls |

---

## Running Locally (without Docker)

```bash
# 1. Start PostgreSQL (Docker)
docker compose up db -d

# 2. Copy env
cp .env.example .env  # fill in GEMINI_API_KEY

# 3. Install dependencies
pnpm install

# 4. Run migrations
pnpm --filter @flowright/api exec drizzle-kit migrate

# 5. Start both apps
pnpm dev
```

## Running with Docker

```bash
docker compose up --build
```

Access: http://localhost:3000