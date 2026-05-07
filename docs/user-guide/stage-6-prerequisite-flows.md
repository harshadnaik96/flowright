---
title: "Prerequisite Flows"
---

# Flowright — Prerequisite Flows

## The problem

Most test flows require the user to be logged in. Without a prerequisite, every flow that touches an authenticated page must either include login steps itself (duplicated across every flow) or assume the browser is already in a logged-in state (fragile and hard to automate).

Prerequisite flows solve this by letting you designate one flow — typically your Login or Setup flow — as a dependency that runs first, in the **same browser session**, before the main flow's steps begin.

---

## How it works

1. You have a **Login** flow that: opens the app, enters credentials, and lands on the home screen.
2. You have a **Transaction History** flow that assumes the user is already logged in.
3. You set the Login flow as a **prerequisite** of the Transaction History flow.
4. When the Transaction History flow runs, Flowright:
   - Executes all Login flow steps in the same browser context
   - On success: begins the Transaction History steps (the session, cookies, and auth tokens are live)
   - On failure: marks all Transaction History steps as **Skipped** and stops

The session is shared end-to-end — the main flow sees exactly the browser state that the prerequisite left behind.

---

## Setting a prerequisite

1. Open any **approved** flow's detail page
2. Scroll to the **Prerequisite** section
3. Select another flow from the dropdown — only flows in the same project are shown
4. Click **Save**

To remove a prerequisite, click **Clear**.

> A flow cannot be its own prerequisite. Circular chains (A → B → A) are not validated at setup time but will fail at run time when the loop is detected — keep chains to a single level.

---

## During a run

The run setup page shows an info box if the flow has a prerequisite:

```
This flow requires "Login" to run first. It will execute automatically in the same session.
```

Once started, a banner appears at the top of the live step view:

```
Running prerequisite: Login (3 steps)
```

The banner updates as the prerequisite progresses:
- **Blue / spinning** — prerequisite is running
- **Green** — prerequisite passed, main steps starting
- **Red** — prerequisite failed; main steps skipped

---

## When to use this

| Scenario | What to do |
|----------|-----------|
| Every flow needs login | Create one Login flow, set it as prerequisite on all other flows |
| Some flows need login, some don't | Only set the prerequisite on the flows that require it |
| Mobile flows with "Skip authentication" | Use the skip checkbox instead — the prerequisite feature is intended for web flows |
| Setup that isn't login (e.g. navigate to a specific section) | Works exactly the same — any flow can be a prerequisite |

---

## Tips

- Keep prerequisite flows **short and focused** — they run on every execution of dependent flows, so a slow login flow will slow every run that depends on it.
- If the prerequisite itself fails, check it in isolation first: run the Login flow standalone to confirm it's passing before investigating the main flow.
- Prerequisite flows appear in the live run view as a separate phase. Screenshots from the prerequisite phase are saved under the main run's record.
- Changing the prerequisite does not affect existing run history — only future runs use the updated prerequisite setting.
