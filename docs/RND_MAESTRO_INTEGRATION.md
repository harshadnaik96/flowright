# R&D: Maestro CLI — Analysis & Integration Strategy

## What Is Maestro CLI?

Maestro is an open-source, single-binary framework for end-to-end mobile and web UI testing. It uses a simple declarative YAML syntax to define user journeys ("Flows") and executes them against mobile devices (Android/iOS) or a managed Chromium browser.

**Source**: https://docs.maestro.dev

---

## How Maestro Works (Under the Hood)

### Core Architecture

| Aspect | Details |
|--------|---------|
| Language | Kotlin (runtime), YAML (flows) |
| Runtime | Java 17+ (JVM-based interpreter) |
| YAML Parser | SnakeYAML + Jackson databind |
| JavaScript Engine | GraalJS (ES6+ support, Rhino as fallback) |
| Element Detection | **Accessibility Tree** (not DOM/CSS selectors) |
| Web Browser | Chromium only (auto-managed) |
| Device Connection | Port 7001 for device communication |
| Execution Model | Sequential, interpreted, no compilation step |

### Key Philosophy: "Embracing Instability"

Unlike Playwright/Cypress where you must write explicit waits and retries, Maestro:
- **Auto-waits** for the screen to settle before every action
- **Polls continuously** (up to 7 seconds) on assertions instead of single-check
- Uses `retryTapIfNoChange` to handle unresponsive taps
- Uses `extendedWaitUntil` for slow network operations
- Eliminates `sleep()` injection — intelligent waiting only

---

## Maestro vs Playwright / Cypress

| Aspect | Playwright / Cypress | Maestro |
|--------|---------------------|---------|
| Element detection | DOM / CSS selectors | Accessibility Tree |
| Test syntax | Code (JS/TS) | Declarative YAML |
| Stability approach | Developer writes waits/retries | Built-in automatic settling |
| Mobile support | Limited | Native (iOS + Android + Web) |
| Web browser | Any | Chromium only |
| Flakiness | Developer's problem | Core philosophy handles it |
| Runtime | Node.js | Kotlin + Java 17 (JVM) |
| Video recording | Manual setup | Built-in (`startRecording` / `maestro record`) |

---

## Maestro YAML Syntax

### Basic Flow Structure

```yaml
# Header (configuration)
url: https://app.example.com   # for web; use appId: for mobile
name: "Login Flow"
tags:
  - login
  - critical
env:
  USERNAME: user@example.com
onFlowStart:
  - launchApp
onFlowComplete:
  - clearState
---
# Commands (steps)
- launchApp
- tapOn: "Username"
- inputText: "${USERNAME}"
- tapOn: "Password"
- inputText: "${PASSWORD}"
- tapOn:
    text: "Sign In"
    retryTapIfNoChange: true
- assertVisible: "Dashboard"
- takeScreenshot:
    path: login-success
```

### Full Command Reference

**Interaction:**
- `tapOn` — tap element by text, id, index, or coordinates
- `longPressOn` — long press on element
- `swipe` — swipe gesture (UP/DOWN/LEFT/RIGHT or coordinates)
- `scroll` — vertical scroll
- `inputText` — enter text (supports `${VARIABLE}`)
- `inputRandomEmail`, `inputRandomPersonName`, `inputRandomNumber`

**Navigation:**
- `launchApp` — launch app (optional `clearState: true`)
- `openLink` — open deep links or URLs
- `back` — Android back navigation
- `hideKeyboard` — attempt keyboard dismiss

**Assertions:**
- `assertVisible` — assert element visible (polls 7 seconds)
- `assertNotVisible` — assert element not visible
- `assertTrue` — assert JavaScript condition
- `assertScreenshot` — visual regression against baseline
- `assertWithAI` — LLM-powered screenshot assertion (beta)

**Wait:**
- `extendedWaitUntil` — wait with custom timeout for slow network ops
- `waitForAnimationToEnd`

**Control Flow:**
- `repeat` — loop with `times: N` or `while: condition`
- `runFlow` — execute nested/reusable subflow with params
- `if` / `when` — conditional execution
- `onFlowStart` / `onFlowComplete` — setup / teardown hooks

**State & Recording:**
- `takeScreenshot` — save PNG to `.maestro/`
- `startRecording` / `stopRecording` — video capture (max 3 min inline)
- `clearState` — reset app data

**Scripting:**
- `evalScript` — inline JavaScript
- `runScript` — execute JavaScript file

---

## Selector Strategy

Maestro interacts with the **Accessibility Tree** — the same view assistive devices use.

### Selector Types

| Type | Example | Best For |
|------|---------|----------|
| Text | `tapOn: "Login"` | Visible labels — most readable |
| ID | `tapOn: id: submit_button` | Multilingual apps, icons |
| Index | `tapOn: index: 0` | Multiple identical elements |
| Point | `tapOn: point: {x: 100, y: 200}` | Coordinate-based |

### Relational Selectors (AND logic)

```yaml
- tapOn:
    text: "Submit"
    enabled: true
    below: "Password Field"
    rightOf: "Username"
```

Supports: `above`, `below`, `leftOf`, `rightOf`, `containsChild`, `childOf`, `containsDescendants`

### Best Practice
Prefer `text:` selectors — they validate what users actually see and survive CSS refactors.

---

## Subflows (Reusability)

```yaml
# subflows/login.yaml
url: "${BASE_URL}"
---
- tapOn: "Login"
- inputText: "${PHONE}"
- tapOn: "Get OTP"
- inputText: "${OTP}"
- tapOn: "Submit"
```

```yaml
# flows/payment-test.yaml
url: "${BASE_URL}"
---
- runFlow:
    path: ../subflows/login.yaml
    params:
      PHONE: "${PHONE}"
      OTP: "${OTP}"
- tapOn: "Make Payment"
- inputText: "${AMOUNT}"
- assertVisible: "Success"
```

---

## JavaScript Integration

### Inline (`evalScript`)

```yaml
- evalScript: |
    ${
      const randomId = Math.floor(Math.random() * 10000);
      output.userId = randomId;
      output.email = `user${randomId}@example.com`;
    }
- inputText: "${output.email}"
```

### File-based (`runScript`)

```yaml
- runScript: setup.js
- inputText: "${output.userData.email}"
```

**Capabilities**: Full ES6+ via GraalJS, `output` object for cross-flow data, HTTP client, Faker library for test data.
**Constraints**: No filesystem access, no external Node.js libraries.

---

## Maestro Hierarchy (Element Discovery)

```bash
maestro hierarchy
```

Dumps the full accessibility tree of the current screen — hierarchical structure of all visible elements with type, text, accessibility ID, position/size, and state.

**Use case**: Identify selectors, debug flaky selectors, understand UI structure. Maestro Studio provides a visual picker that generates selectors automatically.

---

## Maestro Cloud & CI/CD

```bash
maestro cloud --app-file app.apk --flows-dir flows/ --environment "ENV=prod"
```

- Run tests in parallel on managed device fleet (up to 90% faster)
- Integrations: GitHub Actions, Bitrise, Bitbucket Pipelines, CircleCI
- Exit codes: `0` = all passed, `1` = any failed
- **Note**: No REST API — all execution is CLI-based

---

## Known Limitations

| Area | Limitation |
|------|-----------|
| Android | No Unicode/non-ASCII text input |
| iOS | Keyboard hiding unreliable |
| General | 15-minute test timeout |
| Web | Beta status — Chromium only |
| Recording | Inline `startRecording` limited to 3 minutes |
| API | No REST API; must spawn CLI child processes |
| Deployment | Requires Java 17+ runtime |

---

## How This Solves Flowright's Critical Gaps

| Flowright Gap | Maestro Solution |
|---------------|-----------------|
| Custom 580-line Cypress-to-Playwright adapter (fragile) | Replace entirely — shell out `maestro test flow.yaml` |
| No retry logic | Built-in — automatic UI settling + 7-second polling |
| iframes, shadow DOM, file upload edge cases | Accessibility tree approach avoids DOM edge cases |
| Flaky selectors breaking tests | `retryTapIfNoChange`, `extendedWaitUntil`, relational selectors |
| Screenshots only (no video) | Built-in video recording (`startRecording` / `maestro record`) |
| Web-only testing | Extends to Android + iOS — entirely new market segment |

---

## Proposed Architectural Shift

### Current Flowright Flow

```
Playwright Crawler → SelectorRegistry → Gemini (generates Cypress JS) → Custom Runner (580 lines) → Screenshots
```

### Flowright + Maestro Flow

```
Playwright Crawler → SelectorRegistry → Gemini (generates Maestro YAML) → maestro test → MP4 + Screenshots
```

### Why YAML Generation Is Better for AI

| Cypress JS (current) | Maestro YAML (proposed) |
|----------------------|------------------------|
| Must know exact selectors | `tapOn: "Pay Now"` — Maestro finds it |
| JavaScript syntax errors possible | YAML syntax is forgiving |
| Gemini must know cy.get / cy.contains API | Simple declarative commands |
| More tokens, more hallucination risk | Less context, more reliable output |

### Simplified Runner (What the Code Becomes)

```typescript
import { spawn } from 'child_process'

const proc = spawn('maestro', ['test', flowYamlPath], {
  env: { ...process.env, ...runtimeVars }
})

proc.stdout.on('data', (data) => {
  // Parse Maestro output lines → emit WebSocket events
  broadcastWsEvent(runId, parseStepEvent(data.toString()))
})

proc.on('close', (code) => {
  markRunComplete(runId, code === 0 ? 'passed' : 'failed')
})
```

The 580-line runner reduces to ~80 lines of process spawning and output parsing.

---

## Auth Subflows — The Big Architectural Win

Flowright can auto-generate Maestro subflows from the environment's auth configuration and reuse them across every test flow:

```yaml
# Auto-generated: subflows/env-{id}-auth.yaml
url: "${BASE_URL}"
---
- tapOn: "Login"
- inputText: "${PHONE}"
- tapOn: "Get OTP"
- inputText: "${OTP}"
- tapOn: "Submit MPIN"
- inputText: "${MPIN}"
- assertVisible: "Home"
```

Every generated test flow then simply starts with:

```yaml
- runFlow:
    path: ../subflows/env-123-auth.yaml
    params:
      PHONE: "${PHONE}"
      OTP: "${OTP}"
      MPIN: "${MPIN}"
```

This eliminates duplicated auth logic across flows and makes auth changes a single-file update.

---

## Integration Strategy (Recommended)

| Component | Decision |
|-----------|----------|
| Web testing runner | Migrate to Maestro (eliminates custom adapter) |
| Mobile testing | Add Maestro as new capability — where it truly shines |
| AI generation target | Switch Gemini output from Cypress JS → Maestro YAML |
| Crawler | Keep Playwright crawler; optionally augment with `maestro hierarchy` |
| Auth subflows | Auto-generate from environment auth config on first crawl |

---

## Trade-offs

| Pro | Con |
|-----|-----|
| Eliminates fragile 580-line custom runner | Java 17 runtime dependency (deployment complexity) |
| YAML is easier and safer for Gemini to generate | Maestro web is still Beta |
| Built-in flakiness tolerance | No REST API — must spawn CLI child processes |
| Mobile support unlocked (iOS + Android) | Chromium-only for web |
| Video recording out of the box | Output parsing requires reading stdout (no structured events) |
| `runFlow` enables reusable auth subflows | Less control over execution internals |

---

## Recommended Next Step (Spike)

1. Install Maestro CLI locally (`brew install maestro`)
2. Modify the Gemini generator prompt to output Maestro YAML instead of Cypress commands
3. Write a minimal runner that shells out `maestro test` and parses stdout for step events
4. Run a single flow end-to-end and validate WebSocket events fire correctly
5. If successful, migrate the full runner service

**If the spike works cleanly, the migration path is clear and the mobile expansion becomes a roadmap item.**

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-04-06 | Identified Maestro as candidate to replace custom Cypress-to-Playwright runner | Custom runner is 580 lines, fragile, missing retry logic, and web-only |
| 2026-04-06 | Prefer Maestro YAML generation over Cypress JS for AI output | YAML is declarative, simpler for LLMs to generate correctly, fewer syntax failure modes |
| 2026-04-06 | Mobile support as roadmap item pending Maestro web stability | Web is Beta; validate web first before committing to mobile expansion |
