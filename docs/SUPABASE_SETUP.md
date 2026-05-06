# Supabase Storage Setup

Flowright uploads run screenshots to Supabase Storage so they survive server restarts and are shareable across machines. If Supabase env vars are missing, the runner falls back to local filesystem (`SCREENSHOT_DIR`, default `/tmp/flowright-runs`) — useful for offline dev.

## 1. Create a Supabase project

1. Go to https://supabase.com → **New project**
2. Pick a region close to your API server (lower latency for screenshot uploads)
3. Wait for the project to provision (~1 min)

## 2. Create the storage bucket

1. In the Supabase dashboard, open **Storage** (left sidebar)
2. Click **New bucket**
3. Name: `flowright-runs` (or any name — set `SUPABASE_BUCKET` to match)
4. **Public bucket: ON** — screenshots are referenced by direct URL in the run viewer
5. Click **Create bucket**

> Public is fine for a POC: anyone with the URL can view a screenshot, but URLs are unguessable (`<runId>/step-N.png` where runId is a UUID). Switch to signed URLs later if you add auth.

### Optional: bucket policies

For a public bucket, no policy changes are required. Uploads from the API use the `service_role` key, which bypasses RLS.

## 3. Get your credentials

In **Project Settings → API**:

- `Project URL` → `SUPABASE_URL`
- `service_role` key (under **Project API keys**, click "Reveal") → `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ The `service_role` key is **server-side only**. Never expose it to the browser. Flowright only uses it from `apps/api`.

## 4. Configure env vars

Add to `apps/api/.env`:

```bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...           # service_role, NOT anon
SUPABASE_BUCKET=flowright-runs
```

Restart the API. New runs will upload screenshots to Supabase. The `stepResults.screenshotPath` column will store full public URLs (e.g. `https://xxx.supabase.co/storage/v1/object/public/flowright-runs/<runId>/step-1.png`); existing rows with relative paths continue to be served by the legacy `/runner/screenshots/:runId/:filename` endpoint.

## 5. Verify

1. Run any approved flow
2. In the Supabase dashboard, **Storage → flowright-runs**, you should see a folder named after the runId
3. The run viewer should display screenshots — if they 404, check the API server logs for `Supabase upload failed: ...`

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Supabase upload failed: new row violates row-level security policy` | Bucket not public OR using `anon` key instead of `service_role` |
| Screenshots still going to `/tmp/flowright-runs` | Env vars not loaded — restart the API; check `dotenv` is reading `apps/api/.env` |
| Public URL returns 404 | Bucket name in URL doesn't match `SUPABASE_BUCKET` env var |

## Cost notes

Supabase free tier includes 1 GB storage + 2 GB egress/month. A typical screenshot is ~50 KB, so ~20k screenshots fit in the free tier. Switch to signed URLs (and a private bucket) once you add user auth to avoid public exposure of historical runs.
