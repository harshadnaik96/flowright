# Flowright — Running a Flow

## How it works

Once you approve a flow, it's ready to run. Flowright executes each step in a real browser — the same way a human tester would — and shows you live progress as it goes.

---

## Starting a Run

1. Open any approved flow and click **Run Flow**
2. You'll see the run setup page

---

## The Run Setup Page

Before running, you'll configure two things:

**Environment** — which app URL to test against (dev or staging). Select the one you want.

**Variables** — if the flow has any variables (e.g. `phone_number`), you'll see a field for each one. The last-used value is pre-filled. Change it if you're testing a different account.

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

For each step, you can click **View screenshot** to see what the browser looked like at that moment (captured right after the step executed, even on failure).

---

## Run Again

Click **Run Again** to go back to the setup form. You can change the phone number or environment and re-run without leaving the page.

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

## Tips

- You don't need to stay on the page — but if you navigate away, live updates stop. The results are saved to the database regardless.
- If a step fails on a timing issue (slow network, slow app), the error usually says "Timeout" — try running again before editing the flow.
- For OTP and MPIN: you never need to enter these — they come from the environment config automatically.
- Screenshots capture the full visible viewport, not just the element being tested. They're useful for understanding what the app looked like when a step failed.
