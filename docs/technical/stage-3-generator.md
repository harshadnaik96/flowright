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

Model: `gemini-2.0-flash`
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

- Role: "You are a Maestro mobile automation engineer"
- Selector source: accessibility IDs and visible text from `MobileSelectorEntry[]` (not CSS selectors)
- Output format: Maestro YAML (`tapOn`, `inputText`, `assertVisible`, `swipeDown`, etc.)
- Variable format: `${VARIABLE_NAME}` instead of `Cypress.env('key')`
- Auth variables: `${PHONE}`, `${OTP}`, `${MPIN}`, `${EMAIL}`, `${PASSWORD}`

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
