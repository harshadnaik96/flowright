import { chromium, type Page, type BrowserContext } from "playwright";
import type { EnvironmentAuth, SelectorEntry, ElementType } from "@flowright/shared";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authenticateCredentials(
  page: Page,
  auth: EnvironmentAuth,
  baseUrl: string
): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  // Step 1 — phone number
  if (auth.phoneNumber) {
    const phoneInput = page.locator(
      'input[type="tel"], input[name*="phone"], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="number" i]'
    ).first();
    await phoneInput.waitFor({ timeout: 10_000 });
    await phoneInput.click();
    await phoneInput.pressSequentially(auth.phoneNumber, { delay: 50 });

    const continueBtn = page.locator('button:not([disabled])').filter({
      hasText: /send otp|continue|next|get otp/i,
    }).first();
    await continueBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await continueBtn.click();
  }

  // Step 2 — OTP
  if (auth.otp) {
    // --- Detect split OTP (multiple individual digit boxes, e.g. 6 boxes for a 6-digit OTP) ---
    // These have maxlength="1" and are positioned next to each other
    const splitOtpBoxes = page.locator('input[maxlength="1"]');
    await page.waitForTimeout(500); // brief pause for the OTP screen to settle
    const splitCount = await splitOtpBoxes.count();

    if (splitCount >= 4) {
      // Split OTP: click the FIRST box, then type all digits.
      // These inputs use auto-advance — each keypress moves focus to the next box,
      // so we must NOT click each box manually (that fights the auto-focus).
      const firstBox = splitOtpBoxes.first();
      await firstBox.click();
      await firstBox.pressSequentially(auth.otp, { delay: 80 });
    } else {
      // Single OTP input field
      const otpInput = page.locator(
        [
          'input[inputmode="numeric"][maxlength]',
          'input[type="tel"][maxlength]',
          'input[type="number"][maxlength]',
          'input[name*="otp" i]',
          'input[name*="pin" i]',
          'input[name*="code" i]',
          'input[placeholder*="otp" i]',
          'input[placeholder*="verification" i]',
          'input[placeholder*="enter code" i]',
          'input[placeholder*="digit" i]',
        ].join(', ')
      ).first();
      await otpInput.waitFor({ timeout: 15_000 });
      await otpInput.click();
      await otpInput.pressSequentially(auth.otp, { delay: 50 });
    }

    // Wait for the button to become enabled after React processes all digits
    const submitOtp = page.locator('button:not([disabled])').filter({
      hasText: /verify|submit|continue|next/i,
    }).first();
    await submitOtp.waitFor({ state: 'visible', timeout: 10_000 });
    await submitOtp.click();
  }

  // Step 3 — MPIN
  if (auth.mpin) {
    const mpinInput = page.locator(
      'input[type="password"], input[name*="mpin" i], input[name*="pin" i], input[placeholder*="mpin" i], input[placeholder*="pin" i]'
    ).first();
    await mpinInput.waitFor({ timeout: 10_000 });
    await mpinInput.click();
    await mpinInput.pressSequentially(auth.mpin, { delay: 50 });

    const submitMpin = page.locator('button:not([disabled])').filter({
      hasText: /login|sign in|submit|continue/i,
    }).first();
    await submitMpin.waitFor({ state: 'visible', timeout: 10_000 });
    await submitMpin.click();
  }

  // Wait for navigation away from auth pages
  await page.waitForURL(
    (url) => !url.pathname.match(/login|otp|mpin|verify|auth/i),
    { timeout: 15_000 }
  );
}

async function authenticateEmailPassword(
  page: Page,
  auth: EnvironmentAuth,
  baseUrl: string
): Promise<void> {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  if (auth.email) {
    const emailInput = page.locator(
      'input[type="email"], input[name*="email" i], input[name*="username" i], input[placeholder*="email" i], input[placeholder*="username" i]'
    ).first();
    await emailInput.waitFor({ timeout: 10_000 });
    await emailInput.click();
    await emailInput.pressSequentially(auth.email, { delay: 50 });
  }

  if (auth.password) {
    const passwordInput = page.locator(
      'input[type="password"], input[name*="password" i], input[placeholder*="password" i]'
    ).first();
    await passwordInput.waitFor({ timeout: 10_000 });
    await passwordInput.click();
    await passwordInput.pressSequentially(auth.password, { delay: 50 });
  }

  const submitBtn = page.locator('button:not([disabled])').filter({
    hasText: /login|sign in|submit|continue|next/i,
  }).first();
  await submitBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await submitBtn.click();

  // Wait for navigation away from auth pages
  await page.waitForURL(
    (url) => !url.pathname.match(/login|otp|mpin|verify|auth|signin/i),
    { timeout: 15_000 }
  );
}

async function authenticateSSO(
  context: BrowserContext,
  auth: EnvironmentAuth
): Promise<void> {
  if (!auth.storageState) throw new Error("SSO auth requires storageState");
  const state = JSON.parse(auth.storageState);
  await context.addCookies(state.cookies ?? []);
  // Restore localStorage via init script
  if (state.origins?.length) {
    await context.addInitScript((origins: typeof state.origins) => {
      for (const { origin, localStorage: items } of origins) {
        if (origin === window.location.origin) {
          for (const { name, value } of items) {
            window.localStorage.setItem(name, value);
          }
        }
      }
    }, state.origins);
  }
}

async function authenticateCustomScript(
  page: Page,
  auth: EnvironmentAuth,
  baseUrl: string
): Promise<void> {
  if (!auth.loginScript) throw new Error("custom-script auth requires loginScript");
  // loginScript is a JS function body with access to `page` and `baseUrl`
  const fn = new Function("page", "baseUrl", auth.loginScript);
  await fn(page, baseUrl);
}

// ─── Element Extraction ───────────────────────────────────────────────────────

function buildSelector(el: {
  id?: string;
  testId?: string;
  ariaLabel?: string;
  name?: string;
  placeholder?: string;
  text?: string;
  tagName: string;
  type?: string;
}): string {
  if (el.testId) return `[data-testid="${el.testId}"]`;
  if (el.id) return `#${el.id}`;
  if (el.ariaLabel) return `[aria-label="${el.ariaLabel}"]`;
  if (el.name) return `${el.tagName}[name="${el.name}"]`;
  if (el.placeholder) return `${el.tagName}[placeholder="${el.placeholder}"]`;
  if (el.text && el.tagName !== "input") return `${el.tagName}:has-text("${el.text.slice(0, 40)}")`;
  if (el.type) return `${el.tagName}[type="${el.type}"]`;
  return el.tagName;
}

async function extractElements(page: Page, pageUrl: string): Promise<SelectorEntry[]> {
  return page.evaluate((url) => {
    const entries: Array<{
      label: string;
      selector: string;
      elementType: string;
      pageUrl: string;
      textContent?: string;
      placeholder?: string;
      ariaLabel?: string;
    }> = [];

    // Standard interactive elements
    const standardSelectors = [
      { query: "button", type: "button" },
      { query: "input", type: "input" },
      { query: "a",     type: "link" },   // include <a> without href for SPA links
      { query: "select", type: "select" },
      { query: "textarea", type: "textarea" },
    ];

    // ARIA-role interactive elements (covers divs/spans used as buttons/links)
    const roleSelectors = [
      { query: '[role="button"]',   type: "button" },
      { query: '[role="link"]',     type: "link" },
      { query: '[role="menuitem"]', type: "button" },
      { query: '[role="tab"]',      type: "button" },
      { query: '[role="option"]',   type: "button" },
    ];

    // Sidebar/nav clickable items — cast a wide net inside aside/nav
    // including plain divs/spans that act as nav links in SPAs
    const navContainerSelectors = [
      { query: "aside a, aside button, aside [role='button'], aside [role='link'], aside [role='menuitem']", type: "link" },
      { query: "nav a, nav button, nav [role='button'], nav [role='link'], nav [role='menuitem']", type: "link" },
    ];

    const allSelectors = [...standardSelectors, ...roleSelectors, ...navContainerSelectors];

    // Extra pass: find any element inside aside/nav with cursor:pointer that has
    // short text content — these are SPA nav links implemented as plain divs/spans
    const navClickables = Array.from(document.querySelectorAll<HTMLElement>("aside *, nav *")).filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.cursor !== "pointer") return false;
      if (style.display === "none" || style.visibility === "hidden") return false;
      const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";
      // Only leaf-ish nodes: short text and not a container with many children
      return text.length > 0 && text.length <= 40 && el.children.length <= 3;
    });

    navClickables.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      const testId = el.getAttribute("data-testid") ?? undefined;
      const ariaLabel = el.getAttribute("aria-label") ?? undefined;
      const id = el.id;
      const text = el.textContent?.trim().replace(/\s+/g, " ") ?? "";

      let selector = "";
      if (testId) selector = `[data-testid="${testId}"]`;
      else if (id && !/^radix-/.test(id)) selector = `#${id}`;
      else if (ariaLabel) selector = `[aria-label="${ariaLabel}"]`;
      else if (text) selector = `${tagName}:has-text("${text.slice(0, 40)}")`;
      else return;

      const label = ariaLabel || text.slice(0, 50) || id || "nav item";
      if (label && selector) {
        entries.push({
          label,
          selector,
          elementType: "link",
          pageUrl: url,
          textContent: text.slice(0, 100),
          ariaLabel,
        });
      }
    });

    for (const { query, type } of allSelectors) {
      const elements = document.querySelectorAll<HTMLElement>(query);

      elements.forEach((el) => {
        // Skip elements explicitly hidden via inline style or CSS visibility
        // Note: do NOT use offsetParent — it breaks for responsive layouts (e.g. hidden lg:block)
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return;

        const tagName = el.tagName.toLowerCase();
        const id = el.id;
        const testId = el.getAttribute("data-testid") ?? undefined;
        const ariaLabel = el.getAttribute("aria-label") ?? undefined;
        const name = (el as HTMLInputElement).name ?? undefined;
        const placeholder = (el as HTMLInputElement).placeholder ?? undefined;
        const elType = (el as HTMLInputElement).type ?? undefined;
        const href = (el as HTMLAnchorElement).href ?? undefined;
        const text = el.textContent?.trim().replace(/\s+/g, " ") ?? undefined;

        // Skip elements with no meaningful label
        if (!text && !ariaLabel && !placeholder && !name && !id) return;
        // Skip long-text elements that are likely content, not controls
        if (text && text.length > 80 && tagName !== "button" && !ariaLabel) return;

        // Build selector — prefer stable attributes over text
        let selector = "";
        if (testId) selector = `[data-testid="${testId}"]`;
        else if (id && !/^radix-/.test(id)) selector = `#${id}`; // skip radix dynamic IDs
        else if (ariaLabel) selector = `[aria-label="${ariaLabel}"]`;
        else if (name) selector = `${tagName}[name="${name}"]`;
        else if (placeholder) selector = `${tagName}[placeholder="${placeholder}"]`;
        else if (href && !href.startsWith("javascript")) {
          try {
            const path = new URL(href).pathname;
            if (path && path !== "/") selector = `a[href="${path}"]`;
          } catch { /* ignore */ }
        }
        if (!selector && text && tagName !== "input") selector = `${tagName}:has-text("${text.slice(0, 40)}")`;
        if (!selector && elType) selector = `${tagName}[type="${elType}"]`;
        if (!selector) selector = tagName;

        const label =
          ariaLabel ||
          text?.slice(0, 50) ||
          placeholder ||
          name ||
          id ||
          `${type} element`;

        if (label && selector) {
          entries.push({
            label,
            selector,
            elementType: type,
            pageUrl: url,
            textContent: text?.slice(0, 100),
            placeholder,
            ariaLabel,
          });
        }
      });
    }

    // Deduplicate by selector
    const seen = new Set<string>();
    return entries.filter((e) => {
      if (seen.has(e.selector)) return false;
      seen.add(e.selector);
      return true;
    });
  }, pageUrl) as unknown as SelectorEntry[];
}

// ─── Main Crawl ───────────────────────────────────────────────────────────────

export interface CrawlOptions {
  baseUrl: string;
  seedUrls: string[];
  auth: EnvironmentAuth;
}

export interface CrawlResult {
  entries: SelectorEntry[];
  crawledAt: string;
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const { baseUrl, seedUrls, auth } = options;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });

  try {
    // Apply SSO storage state before creating the page
    if (auth.type === "sso") {
      await authenticateSSO(context, auth);
    }

    const page = await context.newPage();
    const allEntries: SelectorEntry[] = [];

    // Crawl the pre-auth page (e.g. login form) before authenticating so its
    // selectors (email/password inputs, submit button) are captured in the registry.
    // Skip for SSO and none — there is no login form to capture.
    if (auth.type === "credentials" || auth.type === "email-password" || auth.type === "custom-script") {
      try {
        await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30_000 });
        const preAuthEntries = await extractElements(page, baseUrl);
        allEntries.push(...preAuthEntries);
        console.info(`[crawler] pre-auth crawl: captured ${preAuthEntries.length} selectors from ${baseUrl}`);
      } catch (err) {
        console.warn("[crawler] failed to crawl pre-auth page:", err);
      }
    }

    // Authenticate
    switch (auth.type) {
      case "credentials":
        await authenticateCredentials(page, auth, baseUrl);
        break;
      case "email-password":
        await authenticateEmailPassword(page, auth, baseUrl);
        break;
      case "custom-script":
        await authenticateCustomScript(page, auth, baseUrl);
        break;
      case "sso":
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        break;
      case "none":
      default:
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        break;
    }

    // Always capture the post-auth landing page first (wherever auth dropped us)
    const postAuthUrl = page.url();
    try {
      const landingEntries = await extractElements(page, postAuthUrl);
      allEntries.push(...landingEntries);
      console.info(`[crawler] post-auth landing: captured ${landingEntries.length} selectors from ${postAuthUrl}`);
    } catch (err) {
      console.warn("[crawler] failed to extract from post-auth landing page:", err);
    }

    // Then crawl seedUrls (skip baseUrl if it's the login page — auth already handled it)
    const urlsToCrawl = Array.from(new Set(seedUrls)).filter((u) => u !== postAuthUrl);

    for (const url of urlsToCrawl) {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const entries = await extractElements(page, url);
        allEntries.push(...entries);
        console.info(`[crawler] seed url: captured ${entries.length} selectors from ${url}`);
      } catch (err) {
        console.warn(`[crawler] failed to crawl ${url}:`, err);
      }
    }

    // Global deduplicate across pages by selector
    const seen = new Set<string>();
    const deduplicated = allEntries.filter((e) => {
      if (seen.has(e.selector)) return false;
      seen.add(e.selector);
      return true;
    });

    return {
      entries: deduplicated,
      crawledAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
