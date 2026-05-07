---
title: "Crawling Your App"
---

# Flowright — Setting Up Your Project & Crawling Your App

## What is a Crawl?

Before Flowright can generate test steps, it needs to understand your app's UI — what buttons exist, what inputs are on each page, what links are available.

A **crawl** visits your app, reads all interactive elements, and saves them as a map. This map is then used to generate accurate, working test steps.

Think of it like building an index. You build it once, rebuild it when your app's UI changes significantly.

---

## Step 1 — Create a Project

1. Open Flowright in your browser
2. Click **New Project**
3. Select your **platform**: Web, Android, or iOS
4. Enter your project name (e.g. "Payments App")
5. Click **Create**

> The platform you choose determines how the app is crawled and how tests are run. You cannot change it after the project is created.

---

## Step 2 — Add an Environment

An environment is your app target. You can have multiple (dev, staging).

1. Inside your project, click **Add Environment**
2. Fill in the required fields:

**For web projects:**
- **Name** — e.g. `staging`
- **Base URL** — e.g. `https://staging.app.yourcompany.com`
- **Seed URLs** *(optional)* — specific pages to crawl that may not be reachable from the home page (e.g. `/dashboard`, `/checkout`, `/admin/users`)

**For mobile (Android/iOS) projects:**
- **Name** — e.g. `staging`
- **App ID** — the package name of your app (e.g. `com.example.app`)
  - Ensure the app is installed on the connected device or emulator before crawling
  - No Seed URLs for mobile — the Maestro hierarchy crawler reads the full current screen state

---

## Step 3 — Configure Authentication

Choose how your app is protected:

### No Auth
Your app is publicly accessible. No configuration needed.

### Phone + OTP + MPIN (most common for your team)
Used for dev/staging environments with fixed test credentials.

Fill in:
- **Phone Number** — the crawler's dedicated test account number
- **OTP** — the fixed test OTP (e.g. `123456`)
- **MPIN** — the fixed test MPIN (e.g. `1234`)

These are stored securely and never displayed again after saving.

For **mobile** projects: Flowright will auto-generate a Maestro auth subflow at crawl time using these credentials. Every test flow will automatically begin with a login sequence.

### Email + Password
Used for environments that require email/password login.

For **mobile** projects: same as Phone + OTP — an auth subflow is auto-generated at crawl time.

### SSO *(web only)*
Used for staging environments that use Okta, Azure AD, or any SSO provider.

Click **Capture Session**:
1. A browser window opens
2. Log in manually through your SSO flow
3. Flowright captures the session automatically
4. Session is valid for 8 hours by default

### Custom Script *(web only)*
For non-standard login flows. Provide a Playwright script. Contact your automation engineer to set this up.

---

## Step 4 — Add Seed URLs *(web only)*

Some pages in your app are not linked from the home page. Add them manually so the crawler can reach them.

Examples:
- `/merchant/kyc`
- `/admin/approvals`
- `/user/settings`

The crawler will visit each of these after logging in.

> **Mobile projects** don't have seed URLs. The Maestro hierarchy crawler reads whatever screen is currently visible on the device.

---

## Step 5 — Run the Crawl

**Web:**
1. Click **Crawl** on your environment card
2. Wait 30–60 seconds
3. You'll see: **"247 elements found"** with the crawl timestamp

**Mobile:**
1. Open your app on the connected device or emulator and navigate to the **home screen** (post-login)
2. Click **Crawl** on your environment card
3. Flowright runs `maestro hierarchy` to read the home screen, then automatically taps through navigation tabs (Payments, Profile, Settings, etc.) to capture elements from each screen, then returns to home
4. You'll see the total element count and crawl timestamp

> The crawler auto-navigates common tabs and menus. You don't need to navigate manually — just have the home screen visible and let the crawl do the rest. Deep screens (e.g. Edit Profile, Transaction Details) are not crawled automatically; their elements are handled at generation time using screen coordinates.

Your app is now indexed and ready for test generation.

---

## What Gets Crawled

**Web:** The crawler captures elements from two phases:
1. **Login page (before login)** — email/password inputs, phone fields, login buttons.
2. **Post-login pages** — your `baseUrl` (after redirect) and all `seedUrls`.

Both sets are merged into a single registry.

**Mobile:** The crawler captures the accessibility tree across multiple screens:
- Visible text labels (from native Android, iOS, Flutter, and React Native fields)
- Accessibility IDs (content-desc / accessibilityLabel / Semantics.identifier)
- Resource IDs (Android)
- Element bounds
- Screen name — each element is tagged with which screen it came from

---

## When to Re-Crawl

| Situation | Re-crawl? |
|-----------|-----------|
| First time setup | Yes |
| New pages added to the app | Yes |
| Buttons or inputs renamed | Yes |
| Test step fails with "element not found" or wrong selector | Yes — then re-generate the flow |
| Regular regression run | No |
| Writing new test cases (UI unchanged) | No |

The crawl timestamp is shown on the environment card so you always know how fresh the index is.

---

## About Phone Numbers in Tests

The crawler uses its own dedicated phone number to log in during crawling. This is separate from the phone number testers use in actual test scenarios.

When a tester **runs a test**, they provide their own phone number. OTP and MPIN are automatically used from the environment config — the tester never needs to enter them.