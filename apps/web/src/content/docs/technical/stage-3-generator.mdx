---
title: "AI Generator"
---

# Stage 3 — Technical Reference: LLM Generator

## Overview
The generator is a two-step Gemini pipeline that converts a tester's plain-English test case into reviewed, approved automation steps. The refine step is explicitly separated from the generation step so testers can review and correct the NL before any code is generated.

The generation step is platform-aware:
- **Web** (`platform = "web"`) — produces Cypress-style commands (`cy.get(sel).click()`, etc.)
- **Mobile** (`platform = "android" | "ios"`) — produces Maestro YAML steps (`- tapOn: "Login"`, etc.)

---

## New Files

```
apps/api/src/
├── services/
│   ├── gemini.ts              Gemini client — web: refine, generateSteps, regenerateStep
│   └── gemini-maestro.ts      Mobile: generateMaestroSteps
├── routes/
│   └── generator.ts           Refine, generate, regenerate-step, approve endpoints (platform-aware)
```

The generator route checks `project.platform` and delegates generation:
```ts
if (project.platform === 'web') {
  result = await generateSteps(refined, registry, flowName);
} else {
  result = await generateMaestroSteps(refined, mobileRegistry, flowName, project.platform);
}
```

---

## Two-Step Pipeline

```
1. REFINE   → rawInput        → Gemini → refined NL (tester reviews)
2. GENERATE → refined NL
              + selector registry → Gemini → steps[] + detectedVariables[]
```

These are two separate API calls with a human review gate between them.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/generator/refine` | Refine raw tester input into structured NL |
| POST | `/generator/generate` | Generate Cypress steps from refined NL + registry (creates new flow) |
| POST | `/generator/regenerate-step/:flowId` | Fix a single step with tester instruction |
| POST | `/generator/approve/:flowId` | Approve flow, sync final steps to DB |
| POST | `/generator/regenerate-flow/:flowId` | Re-generate all steps for an existing flow (clears run history) |

---

## Gemini Model

Model: `gemini-3-flash-preview`
SDK: `@google/genai`

Structured output uses `responseMimeType: "application/json"` + `responseSchema` for generation and regeneration calls. The refine call returns plain text.

---

## Refine Prompt Strategy

The refine prompt instructs Gemini to:
- Number every step explicitly
- Break implicit steps into atomic actions (e.g. "login" → phone + OTP + MPIN + submit)
- Replace vague verbs: "check" → "Verify that X is visible"
- Add missing assertion steps at logical points
- **Split compound verification steps** — "verify X and Y are visible" becomes two separate steps, one per element
- Never add steps that change the tester's intent

The tester sees the refined output and can edit it freely before generating steps.

---

## Generate Prompt Strategy

The generate prompt receives:
- Refined NL test case
- Selector registry (label + selector + type + page per entry, summarised)
- Runtime variable conventions
- **Stability hints** (web only) — accepted self-heal proposals from prior runs in the same project (see below)

Key rules embedded in the prompt:
- Phone numbers → `Cypress.env('phone_number')` always
- OTP → `Cypress.env('env_otp')` always
- MPIN → `Cypress.env('env_mpin')` always
- Selector priority: data-testid > id > aria-label > name > placeholder > text
- **Each step is exactly one `cy.` call** — no `&&` or `||` chaining between `cy` commands
- **One assertion per step** — compound verifications (e.g. "verify email AND password are visible") must be one step per element

Variable detection: any 10-digit number or known variable pattern is automatically promoted to a `FlowVariable` with `key: "phone_number"`.

---

## Regenerate Step

When a tester flags a step with a plain-English correction (e.g. "it's called Send Reset Link, not Submit"), only that step is sent to Gemini along with:
- The current step's plain English + Cypress command
- The tester's instruction
- The selector registry

Returns a single corrected step. The rest of the flow is unchanged.

---

## Stability Hints (web only)

Accepted self-heal proposals (see `technical/stage-6-self-heal.md`) feed back into generation as a "STABILITY HINTS" block in the prompt. Format:

```json
[
  {
    "intent": "Click the Sign In button",
    "preferSelector": "[data-testid=\"signin\"]",
    "avoidSelector":  "[data-testid=\"submit\"]",
    "exampleCommand": "cy.get('[data-testid=\"signin\"]').click()"
  }
]
```

Hint scoping by route:

| Route | Scope |
|-------|-------|
| `POST /generator/generate` | project — hints from any flow in the project |
| `POST /generator/regenerate-flow/:flowId` | project |
| `POST /generator/regenerate-step/:flowId` | flow — tighter signal for a single fix |

Helpers: `getStabilityHints(projectId)` and `getStabilityHintsForFlow(flowId)` in `services/self-heal.ts`. Mobile generation does not use hints.

---

## Flow Lifecycle After Generation

```
draft   → created by /generate (steps saved to DB)
          tester reviews steps, may call /regenerate-step multiple times
approved → tester calls /approve (final steps synced, status updated)
archived → set manually later (flow no longer in active rotation)
```

Only `approved` flows can be executed by the runner.

---

---

## Mobile Generation (`gemini-maestro.ts`)

`generateMaestroSteps()` is the mobile parallel to `generateSteps()`. Key differences in the prompt:

- Role: "You are a Maestro mobile test automation expert"
- Selector source: `MobileSelectorEntry[]` from the crawl registry, grouped by screen and injected as a readable block
- Output format: Maestro YAML (`tapOn`, `inputText`, `assertVisible`, `scroll`, etc.)
- Variable format: `${VARIABLE_NAME}` instead of `Cypress.env('key')`
- Auth variables: `${PHONE_NUMBER}`, `${OTP}`, `${MPIN}`, `${EMAIL}`, `${PASSWORD}`

### Registry injection

The registry is formatted as a screen-grouped block and prepended to the prompt:

```
ELEMENT REGISTRY (captured from live app via maestro hierarchy):
Screen: Home
  - text="Dashboard", id="dashboard_tab"
  - text="Payments"
Screen: Payments
  - text="Send Money"
  ...
```

Gemini uses this to select exact `tapOn` targets instead of guessing element labels.

### Tap rules

| Element type | Strategy |
|---|---|
| Buttons, tabs, menu items, links | `tapOn` with exact text/id from registry |
| Icon buttons, unlabelled controls | `tapOn` with point percentage (top-right ~`"90%,8%"`, bottom-left ~`"10%,92%"`) |
| Text input fields | Always `tapOn` with point percentage + `clearText` + `inputText` — never tap by label or placeholder |

Input fields are always point-based because: (1) deep-screen fields are not in the registry (crawl only covers nav-reachable screens), (2) the label above a field (e.g. "Bio") is a non-interactive widget in Flutter/RN, and (3) `clearText` before `inputText` handles pre-existing field content.

### Auth exclusion

Rule 10: auth steps (login, phone entry, OTP, MPIN, password) are excluded from generated steps. The auth subflow is prepended automatically by the runner — generating auth steps would cause double-login.

Output schema per step:
```json
{
  "order": 1,
  "plainEnglish": "Tap the Login button",
  "command": "- tapOn: \"Login\"",
  "selectorUsed": "Login"
}
```

The `command` field is stored in `flow_steps.command` (same column as web Cypress commands). Platform determines interpretation at run time.

---

## Variables Saved Per Flow

`FlowVariable[]` is saved on the flow record at approve time. Each variable has:
- `key` — e.g. `phone_number`
- `defaultValue` — pre-fills the run modal next time
- `description` — shown to tester in run modal

`phone_number` is always included if any step uses `Cypress.env('phone_number')`.
`env_otp` and `env_mpin` are NOT stored as flow variables — they come from the environment config at run time.