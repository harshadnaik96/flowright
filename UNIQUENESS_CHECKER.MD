Yes, several tools exist in this space — but none nail the exact combination you're building. Here's an honest market map:

    ---
    Existing Tools & Where They Fall Short

    Low-code / No-code Web Test Automation

    ┌─────────────┬───────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┐
    │    Tool     │                   What it does                    │                     Gap vs Flowright                      │
    ├─────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
    │ Testim      │ AI-assisted test creation, self-healing selectors │ Requires coding knowledge, expensive enterprise pricing   │
    ├─────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
    │ Mabl        │ AI-powered web testing, auto-healing              │ Enterprise pricing (~$1000+/mo), not plain-English driven │
    ├─────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
    │ Katalon     │ Record & replay + codeless testing                │ Still UI-heavy, not natural language first                │
    ├─────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
    │ Leapwork    │ Visual flowchart-based automation                 │ No plain-English, visual blocks only                      │
    ├─────────────┼───────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤
    │ Reflect.run │ Simple no-code web testing                        │ Very basic, no AI generation                              │
    └─────────────┴───────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘

    AI / LLM-Native Testing (Newest Wave)

    ┌───────────────┬────────────────────────────────────────────────────────┬───────────────────────────────────────────────────┐
    │     Tool      │                      What it does                      │                 Gap vs Flowright                  │
    ├───────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ Momentic      │ AI agent that writes Playwright tests from description │ Web only, developer-focused, not QA-team-friendly │
    ├───────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ Octomind      │ GPT-powered Playwright test generation                 │ Developer tool, requires GitHub integration       │
    ├───────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ QA.tech       │ AI-driven autonomous testing                           │ Fully autonomous (black box), no tester control   │
    ├───────────────┼────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ TestDriver.ai │ AI controls the browser like a human                   │ No structured flow management, no reuse           │
    └───────────────┴────────────────────────────────────────────────────────┴───────────────────────────────────────────────────┘

    Mobile-Specific

    ┌───────────────────────────┬─────────────────────────────────────┬───────────────────────────────────────────────────┐
    │           Tool            │            What it does             │                 Gap vs Flowright                  │
    ├───────────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ Maestro                   │ YAML-based mobile + web testing     │ Just the execution engine, no AI generation layer │
    ├───────────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ Appium                    │ Industry standard mobile automation │ Requires coding, complex setup                    │
    ├───────────────────────────┼─────────────────────────────────────┼───────────────────────────────────────────────────┤
    │ BrowserStack App Automate │ Cloud device testing                │ Execution infrastructure only, no generation      │
    └───────────────────────────┴─────────────────────────────────────┴───────────────────────────────────────────────────┘

    ---
    The Honest Assessment

    No one is doing exactly this combination:
    1. Plain-English input by a non-technical tester
    2. AI-powered crawling → selector discovery
    3. AI generation of executable steps
    4. Unified web + mobile coverage
    5. Affordable / accessible pricing (not enterprise)

    The closest competitors are Momentic and Octomind on the AI-native side — but both are developer tools. They assume you can read and edit Playwright code. Flowright's core bet is that the tester never sees any
    code at all.

    That gap is real and underserved. Most QA teams have 3-5 manual testers for every 1 automation engineer. Those manual testers have no tool built for them in the AI era. That's the whitespace Flowright sits in.
