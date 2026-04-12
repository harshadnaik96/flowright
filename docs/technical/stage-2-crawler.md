---
title: "Crawler"
---

# Stage 2 — Technical Reference: Selector Registry & Crawler

## Overview
The crawler visits your app and extracts all interactive elements into a Selector Registry stored in PostgreSQL. The crawler used depends on the project's `platform`:

- **Web** (`platform = "web"`) — Playwright headless Chromium; produces `SelectorEntry[]` (CSS selectors)
- **Mobile** (`platform = "android" | "ios"`) — Maestro CLI `maestro hierarchy`; produces `MobileSelectorEntry[]` (accessibility IDs, resource IDs, text)

---

## New Files

```
apps/api/src/
├── routes/
│   ├── projects.ts           CRUD for projects
│   ├── environments.ts       CRUD for environments (with auth encryption)
│   └── crawler.ts            Crawl trigger + registry retrieval (platform-aware)
├── services/
│   ├── crawler.ts            Playwright web crawler logic
│   ├── crawler-maestro.ts    Maestro mobile crawler logic
│   └── encryption.ts         AES-256-GCM for sensitive auth fields
```

The crawler route checks `project.platform` and delegates to the correct service:
```ts
if (project.platform === 'web') {
  entries = await crawlEnvironment(env);       // Playwright
} else {
  entries = await crawlMobileApp(env.baseUrl); // Maestro hierarchy
}
```

---

## API Endpoints

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get project by ID |
| POST | `/projects` | Create project |
| PUT | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project (cascades) |

### Environments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:projectId/environments` | List environments |
| GET | `/projects/:projectId/environments/:id` | Get environment + registry metadata |
| POST | `/projects/:projectId/environments` | Create environment |
| PUT | `/projects/:projectId/environments/:id` | Update environment |
| DELETE | `/projects/:projectId/environments/:id` | Delete environment |

### Crawler
| Method | Path | Description |
|--------|------|-------------|
| POST | `/crawler/crawl` | Trigger crawl for an environment |
| GET | `/crawler/registry/:environmentId` | Get latest registry |
| GET | `/crawler/registry/:environmentId/history` | List all past crawls |

---

## Pre-Auth Page Crawl

For `credentials`, `email-password`, and `custom-script` auth types, the crawler visits `baseUrl` **before** authenticating and extracts its elements into the registry. This captures login-page selectors (email input, password input, login button) so they are available to the generator when writing test cases that verify the login form.

Sequence:
1. Visit `baseUrl` unauthenticated → `extractElements` → push to `allEntries`
2. Authenticate (phone/OTP/MPIN, email/password, or custom script)
3. Crawl `baseUrl` again (now authenticated, may redirect to dashboard) + all `seedUrls`
4. De-duplicate all entries by selector across both passes

`sso` and `none` skip step 1 — there is no login form to capture.

---

## Auth Modes

### `none`
No authentication. Playwright navigates directly to `baseUrl`.

### `credentials`
Playwright performs a multi-step login:
1. Visits `baseUrl`
2. Finds phone input via `input[type="tel"]` and common name/placeholder patterns
3. Fills `phoneNumber`, clicks send OTP button
4. Fills `otp`, clicks verify button
5. Fills `mpin`, clicks login button
6. Waits for redirect away from auth pages

Selector strategy uses resilient text-based patterns, not hardcoded IDs.

### `sso`
Playwright Storage State JSON is injected into the browser context before any navigation. Cookies and localStorage are restored, giving an already-authenticated session.

**SSO session expiry:** Checked against `SSO_SESSION_TTL_HOURS` (default 8h). Expired sessions return HTTP 400 with a prompt to re-capture.

### `custom-script`
A JavaScript function body provided by the admin is executed with `(page, baseUrl)` arguments. Gives full Playwright API access for non-standard auth flows.

---

## Credential Encryption

All sensitive `EnvironmentAuth` fields are encrypted with AES-256-GCM before being stored in PostgreSQL:
- `phoneNumber`, `otp`, `mpin`, `username`, `password`, `storageState`, `loginScript`

Encryption key is derived from `ENCRYPTION_KEY` env var using `scrypt`. Format stored: `iv:authTag:ciphertext` (all hex).

Sensitive fields are **never returned in API responses** — replaced with `"••••••••"`.

---

## Selector Extraction Strategy

For each page crawled, Playwright evaluates a script that queries:
- `button` → type: `button`
- `input` → type: `input`
- `a[href]` → type: `link`
- `select` → type: `select`
- `textarea` → type: `textarea`

Selector priority (most stable to least):
1. `[data-testid="..."]`
2. `#id`
3. `[aria-label="..."]`
4. `tag[name="..."]`
5. `tag[placeholder="..."]`
6. `tag:has-text("...")`
7. `tag[type="..."]`

Duplicates across pages are removed. Final registry is stored as `SelectorEntry[]` in `selector_registries.entries` (JSONB).

---

## Flow Variables

`phone_number` is a tester-provided variable at run time — not stored in the environment. OTP and MPIN come from the environment auth config and are injected automatically. Testers never see or type OTP/MPIN during runs.

---

---

## Mobile Crawler (`crawler-maestro.ts`)

Runs `maestro hierarchy` via child process, parses the accessibility tree output, and builds `MobileSelectorEntry[]`. Performs a **multi-screen crawl**: captures the home screen, identifies navigation elements by keyword, taps each nav element using a temp Maestro YAML flow, captures each resulting screen, then navigates back — aggregating elements across all visited screens.

```
captureScreen("Home")
  → find nav candidates (NAV_KEYWORDS match)
  → for each: writeTempFlow → maestro test → captureScreen → back
  → deduplicate all entries
  → MobileSelectorEntry[]
```

Each `MobileSelectorEntry` captures:
- `text` — visible text label (from `text`, `label`, `value`, `title`, `semanticsLabel`, `hintText`, or `hint`)
- `accessibilityId` — content-desc / accessibilityLabel / Semantics.identifier
- `resourceId` — resource-id attribute (Android)
- `bounds` — element bounding box
- `screen` — which screen the element was captured from (e.g. `"Home"`, `"Payments"`)

### Flutter / React Native compatibility

`HierarchyNode` handles field names across all frameworks:

| Framework | Text fields | ID fields |
|-----------|------------|-----------|
| Native Android | `text`, `hintText` | `resourceId`, `accessibilityText` |
| Native iOS | `text`, `hintText` | `accessibilityText` |
| Flutter | `label`, `value`, `title`, `semanticsLabel`, `hint` | `identifier` |
| React Native | `text`, `accessibilityText` | `accessibilityText` |
| Generic | `attributes.text`, `attributes.content-desc`, `attributes.resource-id` | — |

All nodes with any stable identifier are included (not just those with `clickable === true`).

### Temp flow helpers

Navigation during the crawl is done by writing minimal YAML files to `os.tmpdir()` and running `maestro test <file>`. Files are cleaned up after each screen visit. The app must already be open on the device before crawling — no auto-launch is attempted.

### Mobile Auth Subflow Generation

For mobile environments with `credentials` or `email-password` auth, a Maestro subflow YAML is auto-generated at crawl time and stored at `environments.auth_subflow_path`. Every generated mobile flow begins with a `runFlow` step that references this subflow.

Example auto-generated subflow:
```yaml
# subflows/env-{id}-auth.yaml
appId: "${APP_ID}"
---
- tapOn: "Login"
- inputText: "${PHONE}"
- tapOn: "Get OTP"
- inputText: "${OTP}"
- tapOn: "Submit"
```

---

## Database Changes (vs Stage 1)

- `environments.auth` — JSONB, stores encrypted `EnvironmentAuth`
- `environments.seed_urls` — JSONB, stores `string[]`
- `flows.variables` — JSONB, stores `FlowVariable[]`
- `test_runs.runtime_variables` — JSONB, stores `Record<string, string>`
- Removed: `element_type` enum (handled in JSONB entries)