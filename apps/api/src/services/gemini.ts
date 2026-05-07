import { GoogleGenAI, Type } from "@google/genai";
import type { SelectorEntry, FlowVariable } from "@flowright/shared";

const MODEL = "gemini-3-flash-preview";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is required");
  return new GoogleGenAI({ apiKey });
}

// ─── Step 1: Refine ───────────────────────────────────────────────────────────
// Takes rough tester input → returns clean, unambiguous, numbered NL test case

export async function refineTestCase(rawInput: string): Promise<string> {
  const ai = getClient();

  const prompt = `You are a senior QA analyst. A tester has written the following rough test case description. Your job is to rewrite it as a clean, complete, step-by-step test case.

RULES:
1. Number every step clearly (1., 2., 3. ...)
2. Make ALL implicit steps explicit:
   - If "login" is mentioned → break into: enter phone number, enter OTP, enter MPIN, tap login
   - If "navigate" or "go to" is mentioned → write the full path
   - If "verify" or "check" is vague → write exactly what should be visible or what state is expected
3. Replace ambiguous verbs:
   - "check X" → "Verify that X is visible on the screen"
   - "confirm X" → "Verify that X shows [expected value]"
   - "see X" → "Verify that X is displayed"
4. Add missing assertion steps — if a tester describes an action without saying what to verify after, add a logical verification step
5. If a verification step mentions multiple elements (e.g. "verify X and Y are visible"), split it into one step per element
6. Preserve the tester's original intent exactly — do not add steps that change what is being tested
6. Keep language simple and readable by a non-technical tester
7. Do not add code, selectors, or technical terms

Return ONLY the refined test case. No explanations, no preamble.

TESTER'S INPUT:
${rawInput}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const refined = response.text?.trim();
  if (!refined) throw new Error("Gemini returned empty refinement");
  return refined;
}

// ─── Step 2: Generate Steps ───────────────────────────────────────────────────
// Takes refined NL + selector registry → returns Cypress steps + detected variables

export interface GeneratedStep {
  order: number;
  plainEnglish: string;
  command: string;
  selectorUsed: string | null;
}

export interface GenerationResult {
  steps: GeneratedStep[];
  detectedVariables: FlowVariable[];
}

export interface StabilityHintLite {
  plainEnglish: string;
  originalSelector: string | null;
  healedSelector: string | null;
  healedCommand: string;
}

function buildStabilityHintsBlock(hints: StabilityHintLite[] | undefined): string {
  if (!hints || hints.length === 0) return "";
  const compact = hints.slice(0, 20).map((h) => ({
    intent: h.plainEnglish,
    preferSelector: h.healedSelector,
    avoidSelector: h.originalSelector,
    exampleCommand: h.healedCommand,
  }));
  return `\n\nSTABILITY HINTS (selectors that humans accepted as fixes for past failing runs in this project — prefer these over the registry when the intent matches):\n${JSON.stringify(compact, null, 2)}\n`;
}

export async function generateSteps(
  refinedTestCase: string,
  registry: SelectorEntry[],
  flowName: string,
  stabilityHints?: StabilityHintLite[],
): Promise<GenerationResult> {
  const ai = getClient();

  // Summarise registry to reduce token usage — label + selector + type + page
  const registrySummary = registry.map((e) => ({
    label: e.label,
    selector: e.selector,
    type: e.elementType,
    page: e.pageUrl,
    ...(e.placeholder && { placeholder: e.placeholder }),
    ...(e.ariaLabel && { ariaLabel: e.ariaLabel }),
  }));

  const stabilityBlock = buildStabilityHintsBlock(stabilityHints);

  const prompt = `You are a Cypress automation engineer. Convert the following test case into executable Cypress commands.

SELECTOR REGISTRY (elements available in the app):
${JSON.stringify(registrySummary, null, 2)}${stabilityBlock}

RUNTIME VARIABLES (values provided by the tester at run time):
- phone_number → use: Cypress.env('phone_number')
- Any other tester-supplied value detected in the test case

ENVIRONMENT VARIABLES (auto-injected, never hardcoded):
- Email / username → use: Cypress.env('env_email')
- Password → use: Cypress.env('env_password')
- OTP → use: Cypress.env('env_otp')
- MPIN → use: Cypress.env('env_mpin')

RULES:
1. Match every action to the best selector from the registry. Prefer: data-testid > id > aria-label > name > placeholder > text
2. If no registry match exists, fall back in this order:
   a. For clicking navigation/menu/sidebar items by their label: use cy.contains('label').click() — do NOT scope to nav or aside
   b. For other elements: use cy.contains('visible text') or cy.get('[placeholder="..."]') — prefer text/attribute over tag names
   c. Never guess structural tags (nav, aside, header, main) as the primary selector — they are unreliable fallbacks
   d. Sidebar/drawer elements live in <aside> not <nav> — but prefer cy.contains() over either
3. Phone numbers (10-digit numbers, or variables like "phone_number") → always use Cypress.env('phone_number')
4. Email / username login fields → always use Cypress.env('env_email'), never hardcode
5. Password login fields → always use Cypress.env('env_password'), never hardcode
6. OTP values → always use Cypress.env('env_otp')
7. MPIN values → always use Cypress.env('env_mpin')
8. Navigation steps → cy.visit('/path')
9. Assertions → cy.contains() / cy.get().should('be.visible') / cy.url().should('include', ...)
10. Each step must be exactly ONE cy. command — no multi-line commands, no && or || chaining between cy calls
11. If a plain-English step mentions verifying multiple elements (e.g. "verify email AND password"), split it into one step per element
12. Detect any tester-provided variables (e.g. amounts, names, IDs) and list them as detectedVariables
13. OTP/MPIN inputs: Many apps use split digit-box OTP or MPIN fields (multiple inputs with maxlength="1" or type="tel", NOT a single input with placeholder). For these, generate:
    cy.get('input[maxlength="1"]').first().type(Cypress.env('env_otp')) // or 'env_mpin' as appropriate
    Only use cy.get('[placeholder*="OTP"]').type(...) if the registry shows a single OTP input with a placeholder.

FLOW NAME: ${flowName}

TEST CASE:
${refinedTestCase}

Return a JSON object with this exact shape:
{
  "steps": [
    {
      "order": 1,
      "plainEnglish": "Navigate to the login page",
      "command": "cy.visit('/login')",
      "selectorUsed": null
    }
  ],
  "detectedVariables": [
    {
      "key": "phone_number",
      "defaultValue": "",
      "description": "Phone number for this test scenario"
    }
  ]
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                order: { type: Type.NUMBER },
                plainEnglish: { type: Type.STRING },
                command: { type: Type.STRING },
                selectorUsed: { type: Type.STRING },
              },
              required: ["order", "plainEnglish", "command"],
            },
          },
          detectedVariables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                defaultValue: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["key", "defaultValue"],
            },
          },
        },
        required: ["steps", "detectedVariables"],
      },
    },
  });

  const raw = response.text?.trim();
  if (!raw) throw new Error("Gemini returned empty generation");

  const parsed = JSON.parse(raw) as GenerationResult;

  // Ensure phone_number is always in detectedVariables if any step uses it
  const usesPhone = parsed.steps.some((s) =>
    s.command.includes("env('phone_number')"),
  );
  if (
    usesPhone &&
    !parsed.detectedVariables.find((v) => v.key === "phone_number")
  ) {
    parsed.detectedVariables.unshift({
      key: "phone_number",
      defaultValue: "",
      description: "Phone number for this test scenario",
    });
  }

  return parsed;
}

// ─── Step 3: Regenerate a single step ─────────────────────────────────────────
// Tester flags one step with a correction → LLM fixes only that step

export async function regenerateStep(
  stepIndex: number,
  instruction: string,
  currentSteps: GeneratedStep[],
  registry: SelectorEntry[],
  errorMessage?: string,
  stabilityHints?: StabilityHintLite[],
): Promise<GeneratedStep> {
  const ai = getClient();

  const registrySummary = registry.map((e) => ({
    label: e.label,
    selector: e.selector,
    type: e.elementType,
  }));

  const stepToFix = currentSteps[stepIndex];

  const prompt = `You are a Cypress automation engineer. Fix the following test step based on the tester's instruction.

CURRENT STEP:
Plain English: ${stepToFix.plainEnglish}
Command: ${stepToFix.command}
Selector Used: ${stepToFix.selectorUsed ?? "none"}
${errorMessage ? `\nRUNTIME ERROR:\n${errorMessage}` : ""}

TESTER'S CORRECTION:
${instruction}

SELECTOR REGISTRY:
${JSON.stringify(registrySummary, null, 2)}${buildStabilityHintsBlock(stabilityHints)}

IMPORTANT RULES:
- OTP/MPIN inputs: Many apps use split digit-box OTP or MPIN fields (multiple inputs with maxlength="1", NOT a single placeholder field).
  If the error suggests the element was not found and the step is about entering OTP or MPIN, use:
  cy.get('input[maxlength="1"]').first().type(Cypress.env('env_otp')) // or 'env_mpin'
- Only use cy.get('[placeholder*="OTP"]').type(...) if the registry shows a single OTP input with a placeholder.
- Phone numbers → Cypress.env('phone_number')
- OTP → Cypress.env('env_otp')
- MPIN → Cypress.env('env_mpin')
- Password → Cypress.env('env_password')

Return a JSON object for the corrected step:
{
  "order": ${stepToFix.order},
  "plainEnglish": "corrected plain English description",
  "command": "cy.correctedCommand()",
  "selectorUsed": "selector or null"
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          order: { type: Type.NUMBER },
          plainEnglish: { type: Type.STRING },
          command: { type: Type.STRING },
          selectorUsed: { type: Type.STRING },
        },
        required: ["order", "plainEnglish", "command"],
      },
    },
  });

  const raw = response.text?.trim();
  if (!raw) throw new Error("Gemini returned empty step regeneration");
  return JSON.parse(raw) as GeneratedStep;
}

// ─── Self-Heal: propose a replacement selector ────────────────────────────────
// Called from the runner when a step fails with a selector-pattern error.
// We re-extract the live DOM and ask Gemini to pick a new element that matches
// the original intent. Returns null if no confident replacement is found.

export interface ProposeSelectorFixInput {
  failedCommand: string;
  errorMessage: string;
  plainEnglish: string;
  liveElements: SelectorEntry[];
}

export interface ProposeSelectorFixResult {
  healedCommand: string;
  healedSelector: string | null;
  reasoning: string;
}

export type ProposeSelectorFixOutcome =
  | { kind: "proposal"; proposal: ProposeSelectorFixResult }
  | { kind: "rejected"; reason: "no_text" | "parse_error" | "empty_selector" | "unchanged_command" };

export async function proposeSelectorFix(
  input: ProposeSelectorFixInput,
): Promise<ProposeSelectorFixResult | null> {
  const outcome = await proposeSelectorFixDetailed(input);
  return outcome.kind === "proposal" ? outcome.proposal : null;
}

export async function proposeSelectorFixDetailed(
  input: ProposeSelectorFixInput,
): Promise<ProposeSelectorFixOutcome> {
  const ai = getClient();

  // Trim live elements payload — only the fields useful for picking a replacement
  const liveSummary = input.liveElements.slice(0, 200).map((e) => ({
    label: e.label,
    selector: e.selector,
    type: e.elementType,
    ...(e.placeholder && { placeholder: e.placeholder }),
    ...(e.ariaLabel && { ariaLabel: e.ariaLabel }),
    ...(e.textContent && { text: e.textContent }),
  }));

  const prompt = `You are a Cypress automation engineer fixing a flaky test step. The step failed at runtime — most likely because the selector no longer matches an element on the page (the element was renamed, restructured, or removed).

Your job is to propose a replacement Cypress command that targets the SAME logical element using the LIVE DOM snapshot below.

ORIGINAL STEP (plain English): ${input.plainEnglish}
FAILED COMMAND: ${input.failedCommand}
RUNTIME ERROR: ${input.errorMessage}

LIVE DOM ELEMENTS (just re-extracted from the page after the failure):
${JSON.stringify(liveSummary, null, 2)}

RULES:
1. Match the original step's intent. If the original was a click on "Submit" and the live DOM has "Sign In" with the same role/position, that is a likely rename — propose it.
2. Prefer stable selectors: data-testid > id > aria-label > name > placeholder > text.
3. Keep the Cypress command shape identical — same verb (click/type/should/etc.), same action arguments. Only the selector should change.
4. If no element in the live DOM is a confident match for the original intent, return healedSelector: "" and reasoning explaining why.
5. Do NOT invent selectors that aren't in the live elements list.

Return JSON:
{
  "healedCommand": "cy.get('[data-testid=\\"sign-in\\"]').click()",
  "healedSelector": "[data-testid=\\"sign-in\\"]",
  "reasoning": "Original 'Submit' button no longer present; 'Sign In' button with same role found in live DOM."
}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          healedCommand: { type: Type.STRING },
          healedSelector: { type: Type.STRING },
          reasoning: { type: Type.STRING },
        },
        required: ["healedCommand", "reasoning"],
      },
    },
  });

  const raw = response.text?.trim();
  if (!raw) return { kind: "rejected", reason: "no_text" };

  let parsed: ProposeSelectorFixResult;
  try {
    parsed = JSON.parse(raw) as ProposeSelectorFixResult;
  } catch {
    return { kind: "rejected", reason: "parse_error" };
  }
  if (!parsed.healedCommand || parsed.healedCommand.trim() === input.failedCommand.trim()) {
    return { kind: "rejected", reason: "unchanged_command" };
  }
  if (parsed.healedSelector === "") {
    return { kind: "rejected", reason: "empty_selector" };
  }
  return { kind: "proposal", proposal: parsed };
}
