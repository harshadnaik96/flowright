# Stage 1 — Technical Reference: Project Architecture

## Overview
Flowright is a deployed web application that converts plain-English test cases into automated Cypress flows. It is a pnpm monorepo with two apps and one shared package.

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
| Crawler     | Playwright (headless Chromium)    | 1.49.x   |
| Runner      | Cypress (headless on server)      | TBD      |
| Database    | PostgreSQL + Drizzle ORM          | PG 16    |
| Realtime    | WebSocket via `@fastify/websocket`| —        |
| Deployment  | Docker + Docker Compose           | —        |

---

## Shared Types (`packages/shared`)

All cross-boundary types live here. Neither `web` nor `api` define their own entity types — they import from `@flowright/shared`.

Key types:

| Type | Description |
|------|-------------|
| `Project` | Top-level grouping of flows and environments |
| `Environment` | A named URL target (dev, staging) within a project |
| `SelectorRegistry` | Crawled element map for an environment |
| `SelectorEntry` | Single element: label, selector, type, page |
| `Flow` | A named test case with status (draft/approved/archived) |
| `FlowStep` | One step within a flow: plain English + Cypress command |
| `TestRun` | An execution of a flow against an environment |
| `StepResult` | Per-step outcome with screenshot and error detail |
| `WsEvent` | WebSocket event emitted during a test run |

---

## Database Schema (Drizzle ORM)

Tables: `projects`, `environments`, `selector_registries`, `flows`, `flow_steps`, `test_runs`, `step_results`

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
