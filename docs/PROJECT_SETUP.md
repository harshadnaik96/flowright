---
title: "Project Setup"
---

# Flowright — Developer Setup

End-to-end setup for running Flowright locally. If you only want to use a deployed instance, see `user-guide/stage-1-getting-started.md` instead.

---

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 20.x or newer | API + web runtime |
| **pnpm** | 9.x | Workspace package manager (`npm i -g pnpm`) |
| **Docker** | latest | PostgreSQL container (also lets you run the full stack via `docker compose`) |
| **Java** | 17+ | Required only if you'll run mobile flows on the API server (Maestro JVM) |
| **Maestro CLI** | latest | Optional, only for mobile testing — `curl -fsSL "https://get.maestro.mobile.dev" \| bash` |
| **Android emulator / iOS simulator** | n/a | Optional, for mobile flows |

---

## 2. Clone & install

```bash
git clone git@github.com:harshadnaik96/flowright.git
cd flowright
pnpm install
```

Playwright will install browser binaries on first run via the `apps/api` postinstall hook. If it fails, run manually:

```bash
pnpm --filter @flowright/api exec playwright install chromium
```

---

## 3. Start Postgres

```bash
docker compose up db -d
```

This starts a Postgres 16 container with credentials `flowright / flowright` on port 5432, persisted in the `flowright_pg_data` volume.

> If you already have Postgres locally, skip this and adjust `DATABASE_URL` in step 4.

---

## 4. Environment variables

Two `.env` files are read at runtime:

### `apps/api/.env` (server-side secrets)

```bash
# Database
DATABASE_URL=postgresql://flowright:flowright@localhost:5432/flowright

# Server
PORT=3001
HOST=0.0.0.0
WEB_URL=http://localhost:3000

# LLM — get a key from https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Encryption (>= 32 chars). Used to AES-256-GCM encrypt env auth credentials at rest.
# Use `openssl rand -hex 32` to generate one.
ENCRYPTION_KEY=change-this-to-a-long-random-secret-key

# SSO session caching (default: 8 hours)
SSO_SESSION_TTL_HOURS=8

# Cloud screenshot storage (optional — falls back to /tmp/flowright-runs if unset).
# See docs/SUPABASE_SETUP.md for project provisioning.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=flowright-runs
```

### `apps/web/.env.local` (browser-visible config)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

> The root `.env.example` is reference-only — runtime config lives in the per-app files above.

---

## 5. Database schema

Drizzle pushes the current schema to the live DB. Run this **after every `git pull`** if `apps/api/src/db/schema.ts` changed:

```bash
pnpm --filter @flowright/api db:push
```

To inspect the DB visually:

```bash
pnpm --filter @flowright/api db:studio    # opens drizzle-kit Studio in the browser
```

---

## 6. Run the dev servers

```bash
pnpm dev
```

This runs both apps in parallel:
- **API**  → http://localhost:3001 (Fastify with logger + tsx watch)
- **Web**  → http://localhost:3000 (Next.js dev server)

Open http://localhost:3000 — you should see the project list.

### Type-check

```bash
pnpm type-check       # both apps
pnpm --filter @flowright/api type-check
pnpm --filter @flowright/web type-check
```

---

## 7. Smoke test (web only)

1. **Create a project** → platform `web`.
2. **Add an environment** → e.g. `staging`, `https://example.com`, auth `none`.
3. **Crawl the environment** → click "Re-crawl" on the environment page; wait for the registry to build.
4. **Generate a flow** → write a one-line plain-English test (e.g. "Visit the home page and verify the title").
5. **Run the flow** → pick the env, click Run. Steps stream live; screenshots upload to Supabase (or `/tmp/flowright-runs/<runId>/` if Supabase isn't configured).

If steps fail with selector errors, check the **Self-heal review** button on the project header — the runner may have proposed fixes.

---

## 8. Mobile setup (optional)

Mobile flows execute through a local **agent binary** that runs `maestro test` on your machine and streams results back to the API over WebSocket.

1. Install Maestro CLI: `curl -fsSL "https://get.maestro.mobile.dev" \| bash`.
2. Verify: `maestro --version` and connect a device/emulator (`adb devices` or `xcrun simctl list`).
3. In the web app: **Settings → Agent tokens → Create token**. Copy the plain token (shown once).
4. Download the agent binary from the same page (macOS arm64 / x64, Linux x64).
5. Run: `./flowright-agent --token <TOKEN> --api ws://localhost:3001/agent/ws`.
6. The agent appears on the Run page as a connected device. Mobile project + flow then run the same way as web.

---

## 9. Docker (full stack)

To run the whole stack (db + api + web) in containers:

```bash
GEMINI_API_KEY=sk-... docker compose up --build
```

> Note: the agent binary is **not** containerised — it has to run on the host because it talks to local emulators / simulators.

---

## 10. Common issues

| Symptom | Fix |
|---------|-----|
| `pnpm dev` errors with `relation "..." does not exist` | Run `pnpm --filter @flowright/api db:push` to sync schema |
| `GEMINI_API_KEY env var is required` | Add it to `apps/api/.env` and restart |
| Screenshots return 404 in run viewer | Either Supabase isn't configured (check API logs for `Supabase upload failed`) or the legacy fallback path was lost on server restart — re-run the flow |
| Crawler hangs on SSO env | Check `SSO_SESSION_TTL_HOURS` — if storage state is older than that, the runner won't reuse it. Re-crawl to refresh. |
| Agent shows offline immediately after connecting | API restarted between connect and the request — re-run the agent binary |
| `Java not found` when starting a mobile run | Install JDK 17+ (`brew install openjdk@17` on macOS). Maestro is JVM-based. |

---

## Where to go next

- `CURRENT_STATE_AND_ROADMAP.md` — what's built, what's next
- `technical/stage-1-architecture.md` — system overview
- `technical/stage-5-runner.md` — runner + retries + self-heal internals
- `technical/stage-6-self-heal.md` — selector healing pipeline
- `SUPABASE_SETUP.md` — provisioning cloud storage for screenshots
