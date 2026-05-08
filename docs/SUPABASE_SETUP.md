# Supabase Storage Setup

Flowright uploads run screenshots to Supabase Storage so they survive server restarts and are shareable across machines. The bucket stays **private** — the API serves screenshots through a 302 redirect to a short-lived signed URL. If Supabase env vars are missing, the runner falls back to local filesystem (`SCREENSHOT_DIR`, default `/tmp/flowright-runs`) — useful for offline dev.

## 1. Create a Supabase project

1. Go to https://supabase.com → **New project**
2. Pick a region close to your API server (lower latency for screenshot uploads)
3. Wait for the project to provision (~1 min)

## 2. Create the storage bucket

1. In the Supabase dashboard, open **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `flowright-runs` (or any name — set `SUPABASE_BUCKET` to match)
4. **Public bucket: OFF** — leave the bucket private. The API uses the `service_role` key to upload, then mints signed URLs on demand for the frontend
5. Click **Create bucket**

> No bucket policies are required. Uploads from the API use the `service_role` key which bypasses RLS, and reads happen server-side via signed URLs.

## 3. Get your credentials

In **Project Settings → API** (or **Data API** in the newer dashboard layout):

- `Project URL` → `SUPABASE_URL` — bare project URL only, e.g. `https://xxxxxxxxxxxx.supabase.co`. Do **not** include `/rest/v1/`, `/storage/v1/`, or `/v1/s3` — the SDK appends these internally
- `service_role` key (under **Project API keys**, click "Reveal") → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ The `service_role` key is **server-side only**. Never expose it to the browser. Flowright only uses it from `apps/api`.

## 4. Configure env vars

Add to `apps/api/.env`:

```bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...           # service_role, NOT anon
SUPABASE_BUCKET=flowright-runs
SUPABASE_SIGNED_URL_TTL=3600                       # optional, signed URL lifetime in seconds (default 1h)
```

Restart the API. On boot you should see one of:

- ✅ `Screenshot storage: Supabase bucket "flowright-runs"`
- ⚠️ `Screenshot storage: local filesystem (...). Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to persist screenshots across restarts.`

`stepResults.screenshotPath` always stores a uniform relative path `"{runId}/step-{order}.png"` regardless of backend. The route `GET /runner/screenshots/{runId}/{filename}` decides at request time whether to 302-redirect to a signed Supabase URL or stream the local file.

## 5. Verify

1. Run any approved flow
2. In the Supabase dashboard, **Storage → flowright-runs**, you should see a folder named after the runId
3. The run viewer should display screenshots — the browser will see a 302 from `/runner/screenshots/...` and follow it to a signed URL on `*.supabase.co`. If they 404, check the API server logs for `Supabase upload failed: ...`

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Supabase upload failed: Invalid path specified in request URL` | `SUPABASE_URL` includes a path suffix like `/rest/v1/`. Strip everything after `.supabase.co` |
| `Node.js 20 detected without native WebSocket support` | The `ws` peer is missing — already a dependency of `@flowright/api`; reinstall via `pnpm install` |
| Screenshots still going to `/tmp/flowright-runs` | Env vars not loaded — restart the API; check `dotenv` is reading `apps/api/.env` |
| Run viewer screenshots return 404 | Bucket name in `SUPABASE_BUCKET` doesn't match what was created in the dashboard |
| Run viewer screenshots load on first view but break on reload after a long time | Signed URL expired. The frontend re-fetches via `/runner/screenshots/...` on reload, which mints a fresh URL — make sure the response isn't cached upstream (the API sends `Cache-Control: no-store` for this reason) |

## Cost notes

Supabase free tier includes 1 GB storage + 2 GB egress/month. A typical screenshot is ~50 KB, so ~20k screenshots fit in the free tier.
