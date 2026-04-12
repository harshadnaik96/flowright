---
title: "Generating Flows"
---

# Flowright — Writing & Generating Test Flows

## Overview

Creating a test flow in Flowright is a two-step process:

1. **Refine** — you write your test case in plain English, Flowright cleans it up
2. **Generate** — Flowright converts the refined test case into executable steps

There is a human review gate between both steps. Nothing is saved or run until you approve it.

---

## Step 1 — Write Your Test Case

Click **New Flow** inside a project. You'll see a text editor. Write your test case the way you'd naturally describe it — don't worry about being perfect.

**Examples of rough input (all valid):**

```
Login with my number and check the dashboard loads
```

```
Merchant submits KYC, check it shows under review
```

```
Go to forgot password, enter email, submit, make sure success message appears
```

You don't need to write every micro-step. Flowright will fill in the gaps.

---

## Step 2 — Refine

Click **Refine**. Flowright sends your input to Gemini which rewrites it as a clean, numbered test case.

**What refinement does:**
- Breaks "login" into: enter phone number → enter OTP → enter MPIN → tap login
- Adds missing verification steps ("and check it loads" → "Verify that the dashboard is visible")
- Replaces vague language with clear actions
- Numbers every step

**Example — before refine:**
```
Login with merchant number and submit KYC documents, check status
```

**After refine:**
```
1. Navigate to the app login page
2. Enter the merchant's phone number in the phone number field
3. Tap "Send OTP"
4. Enter the OTP in the verification field
5. Tap "Verify"
6. Enter MPIN in the MPIN field
7. Tap "Login"
8. Navigate to the KYC section
9. Upload the required KYC documents
10. Tap "Submit for Review"
11. Verify that the status shows "Under Review"
```

**You can edit the refined text freely** before moving to the next step. If something is wrong, fix it in plain English and click Refine again.

---

## Step 3 — Generate Steps

Once you're happy with the refined test case, click **Generate Steps**.

Flowright uses the refined text and your app's element map (from the last crawl) to generate executable steps.

You'll see two columns side by side:

**Web:**
```
Plain English                        │ Cypress Code (toggle to view)
─────────────────────────────────────┼──────────────────────────────
Navigate to the login page           │ cy.visit('/login')
Enter phone number                   │ cy.get('input[type="tel"]').type(Cypress.env('phone_number'))
Tap Send OTP                         │ cy.contains('Send OTP').click()
Enter OTP                            │ cy.get('#otp-input').type(Cypress.env('env_otp'))
...
```

**Mobile:**
```
Plain English                        │ Maestro YAML (toggle to view)
─────────────────────────────────────┼──────────────────────────────
Tap the Login button                 │ - tapOn: "Login"
Enter the phone number               │ - inputText: "${PHONE}"
Tap Send OTP                         │ - tapOn: "Send OTP"
Verify dashboard is visible          │ - assertVisible: "Dashboard"
...
```

You only need to review the **Plain English** column. The automation code runs automatically — you don't need to understand it.

---

## Step 4 — Review & Correct Steps

Go through each step. If something looks wrong:

1. Click the **edit icon** on that step
2. Type your correction in plain English:
   - *"The button is called Send Reset Link, not Submit"*
   - *"This step should verify the error message, not the success message"*
3. Click **Fix Step** — only that step is regenerated, everything else stays

Repeat for any steps that need fixing.

---

## Step 5 — Approve

When all steps look correct, click **Approve Flow**. This:
- Saves the final steps
- Marks the flow as ready to run
- Makes it available in the flow library for your team

---

## About Phone Numbers

When you write a test that involves logging in, Flowright automatically detects that a phone number is needed. Before running the flow, you'll be asked to enter the phone number you want to test with.

**OTP and MPIN are handled automatically** — you never need to enter them. They come from the environment configuration set up by your admin.

This applies to both web and mobile flows.

---

## Tips for Mobile Test Cases

Mobile test cases use the same plain-English style. A few things to keep in mind:

| Do | Avoid |
|----|-------|
| "Tap the Login button" | "Click Login" (say "tap" for mobile) |
| "Verify that the Dashboard screen is visible" | "Check it loads" |
| "Swipe up to scroll" | "Scroll down" (be explicit about gesture direction) |
| "Enter the phone number in the phone field" | "Type the number" |

Flowright generates Maestro YAML steps from your plain English — the more specific the description, the more accurate the generated step.

**Authentication is automatic** — do not include login, OTP, or MPIN steps in your test case. The app is already logged in when your test steps begin. If you're testing from an already-logged-in state (e.g. running again after the app is open), check **Skip authentication** on the run setup page.

**Input fields on deep screens** (e.g. Edit Profile, forms inside settings) are tapped by screen position since the crawler doesn't reach those screens automatically. Generated steps will use coordinates like `tapOn: { point: "50%,70%" }` for those fields — if a field is in the wrong position, use the step editor to adjust the percentage.

---

## Editing an Existing Flow

If a flow needs changes — wrong test case, outdated steps, or a complete re-test — you can edit it without creating a new flow. Run history will be cleared when you regenerate.

1. Open the flow detail page
2. Click **Edit** in the top-right corner
3. You'll see the same **Write → Refine → Review** wizard, pre-filled with the existing flow name and test case
4. Edit the test case and click **Refine** to re-run the refinement
5. Click **Generate Steps** to regenerate all steps fresh from the updated test case
6. Review and fix any steps, then click **Approve Flow**

> **Note:** Regenerating replaces all existing steps and clears previous run history. The flow URL stays the same.

---

## Deleting a Flow

1. Open the flow detail page
2. Click **Delete** in the top-right corner
3. A confirmation banner appears — click **Delete** again to confirm

Deletion permanently removes the flow and all its run history.

---

## Tips for Writing Good Test Cases

| Do | Avoid |
|----|-------|
| "Verify that the success message is visible" | "Check it works" |
| "Navigate to the KYC section" | "Go there" |
| "Enter the merchant's phone number" | "Login" (too vague) |
| "Tap the Submit button" | "Click" (say what you're clicking) |

The more specific your input, the better the generated steps.