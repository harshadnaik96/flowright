---
title: "Running Flows"
---

# Flowright — Running a Flow

## How it works

Once you approve a flow, it's ready to run. Flowright executes each step and shows you live progress as it goes.

- **Web flows** — Flowright drives a real headless browser (Playwright), exactly like a human tester would
- **Mobile flows** — Flowright uses Maestro CLI to drive the app on the connected device or emulator

---

## Starting a Run

1. Open any approved flow and click **Run Flow**
2. You'll see the run setup page

---

## The Run Setup Page

Before running, you'll configure up to three things:

**Environment** — which target to test against (dev or staging). Select the one you want.
- Web: selects the base URL
- Mobile: selects the app package — ensure the app is open on your device/emulator before running

**Device / Agent** *(mobile only, shown when multiple agents are connected)* — if more than one laptop is running the Flowright agent, pick which device to run on.

**Skip authentication** *(mobile only)* — check this if the app is already logged in on your device and you don't want Flowright to run the login sequence again. Useful when running multiple flows back-to-back on the same session.

**Variables** — if the flow has any variables (e.g. `PHONE_NUMBER`), you'll see a field for each one. The default value from the flow definition is pre-filled. Change it if you're testing a different account.

Click **Run Flow** when ready.

---

## Live Progress

Once the run starts, you'll see each step update in real time:

| Icon | Meaning |
|------|---------|
| Spinning circle | Step is executing now |
| Green checkmark | Step passed |
| Red X | Step failed |
| Gray circle | Step pending or skipped |

If a step fails, Flowright stops there and marks all remaining steps as skipped. The error message from the browser is shown inline.

---

## Results

When all steps complete, you'll see a banner:

- **Green — All steps passed**: the entire flow ran successfully
- **Red — Run failed**: one or more steps failed

For each step, you can click **View screenshot** to see what the screen looked like at that moment:
- **Web** — captured by the browser after every step
- **Mobile** — captured by Maestro only on failed steps (shows the exact state at the point of failure)

---

## Run Again

Click **Run Again** to go back to the setup form. You can change the phone number or environment and re-run without leaving the page.

---

## Run History & Re-run

Open any flow's detail page to see its **Run History** — the last 8 runs, showing:
- Status (passed/failed)
- Which environment was used
- When it ran

Each past run has a **Re-run** button. Clicking it opens the run setup page with the environment and all variables pre-filled to exactly what that run used. This is useful when a run failed and you want to re-run with the same inputs after a fix was deployed.

---

## Fixing a Failed Step's Command

If a step fails because the generated Cypress command is wrong (wrong selector, wrong assertion), you can fix it directly from the run results without re-generating the whole flow.

After a run completes with a failed step:

1. Find the failed step (marked with a red X)
2. Click the **pencil icon** next to the step's Cypress command
3. The command becomes an editable field — update it directly (e.g. change `input[name="email"]` to `#email`)
4. Press **Enter** or click the checkmark to save
5. Click **Run Again** — the fixed command will be used in the next run

The fix is saved to the database immediately. If you run again, the updated command is used.

> If the selector is wrong because the app's UI changed, you should re-crawl the environment first, then edit the flow to regenerate all steps with the fresh registry.

---

## Finding a Flow

From any project page, use the **search bar** at the top of the flow list to find flows by name or description. Use the **status tabs** (All / Approved / Draft / Archived) to narrow down what you see. Both filters work together — you can search within a status.

---

## Tips

- You don't need to stay on the page — but if you navigate away, live updates stop. The results are saved to the database regardless.
- If a step fails on a timing issue (slow network, slow app), the error usually says "Timeout" — try running again before editing the flow.
- For OTP and MPIN: you never need to enter these — they come from the environment config automatically.
- Screenshots capture the full visible viewport (web) or device screen (mobile) at the moment of the step. They're useful for understanding what the app looked like when a step failed.

### Mobile-specific tips

- Ensure your device or emulator is **unlocked and the app is running** before starting a run
- The **Flowright agent** must be running on your laptop before you can start a mobile run — check the status indicator on the run setup page
- If multiple agents are connected, use the **Device / Agent** selector to pick which device to use
- Mobile run screenshots only show failed steps — they capture exactly what was on screen at the moment of failure, which is the most useful view for debugging
- If Maestro can't find an element (e.g. "Element not found: Login"), the screenshot will show you what was actually on screen — use that to diagnose whether the app was on the wrong screen or the element text has changed
- Mobile runs are inherently slightly slower than web runs — allow a few extra seconds before assuming a timeout is a real failure