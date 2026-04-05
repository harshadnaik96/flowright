# Flowright — Using the Interface

## Navigation

Flowright has a simple top navigation bar. Everything starts from **Projects**.

---

## Creating a Project

1. Click **New Project** on the dashboard
2. Enter a name (e.g. "Payments App")
3. Optionally add a description
4. Click **Create Project**

You'll be taken to the project page where you can add environments and create flows.

---

## The Project Page

The project page has two sections:

**Environments** — the app URLs your team tests against (dev, staging). Each environment shows its auth type and has a Crawl button.

**Flows** — all test flows in this project. Each flow shows its status (Draft or Approved) and a Run button for approved flows.

---

## Creating a New Flow (3 Steps)

Click **New Flow** on the project page. You'll see a progress indicator at the top showing three steps: **Write → Refine → Review**.

### Step 1 — Write

Fill in:
- **Flow name** — a short name like "Merchant KYC Submission"
- **Environment** — which app URL to test against (dev or staging)
- **Test case** — describe what you want to test in plain English

Then click **Refine**.

### Step 2 — Refine

Flowright rewrites your test case as a clean, numbered list of steps. Read through it:
- If something looks wrong, click **Edit** and correct it
- If you want to start over, click **Rewrite**
- When it looks good, click **Generate Steps**

### Step 3 — Review Steps

You'll see each step listed with its plain English description. A **Show code** toggle reveals the underlying Cypress command — you don't need to read it unless you're curious.

**To fix a step:**
1. Hover over it — an edit icon appears on the right
2. Click it and type your correction in plain English
3. Click the checkmark — only that step is regenerated

At the bottom, you'll see any **Variables** detected (e.g. `phone_number`). You can set a default value that will pre-fill the next time you run this flow.

When all steps look correct, click **Approve Flow**.

---

## The Flow Detail Page

After approving, you'll see the flow detail page with:
- All steps listed with their Cypress commands visible
- Any variables and their default values
- A **Run Flow** button

In the top-right corner of the page you'll see two action buttons:

### Edit

Click **Edit** to modify the flow. You'll re-enter the same **Write → Refine → Review** wizard, pre-filled with the existing flow name and test case. You can update the test case and regenerate all steps.

> Regenerating replaces all existing steps and clears previous run history. The flow URL stays the same.

### Delete

Click **Delete** to remove the flow. A confirmation banner appears inline — click **Delete** again to confirm. This permanently deletes the flow and all its run history.

---

## Flow Statuses

| Status | Meaning |
|--------|---------|
| Draft | Generated but not yet reviewed or approved |
| Approved | Reviewed and ready to run |
| Archived | No longer in active use |

Only **Approved** flows can be run.

---

## Tips

- You can edit the refined test case freely before generating steps — if the refinement missed something, just type it in
- The inline step fix is the fastest way to correct errors — you don't need to regenerate the entire flow
- Set default values for `phone_number` if you always test the same account — it saves time at run time
