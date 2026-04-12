import { GoogleGenAI, Type } from "@google/genai";
import type { FlowVariable, MobileSelectorEntry } from "@flowright/shared";

const MODEL = "gemini-3-flash-preview";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is required");
  return new GoogleGenAI({ apiKey });
}

// Re-use the same GeneratedStep shape as the web generator
export interface GeneratedStep {
  order: number;
  plainEnglish: string;
  command: string; // Maestro YAML snippet, e.g. "- tapOn: \"Login\""
  selectorUsed: string | null;
}

export interface GenerationResult {
  steps: GeneratedStep[];
  detectedVariables: FlowVariable[];
}

// ─── Generate Maestro steps from refined NL ───────────────────────────────────
// Registry is sourced from a prior `maestro hierarchy` crawl of the live app.
// Variables are passed as Maestro env vars: ${PHONE_NUMBER}, ${OTP}, etc.

function buildRegistrySection(registry: MobileSelectorEntry[]): string {
  if (registry.length === 0) return "";

  // Group by screen for readability in the prompt
  const byScreen = new Map<string, MobileSelectorEntry[]>();
  for (const entry of registry) {
    const screen = entry.screen ?? "Unknown";
    if (!byScreen.has(screen)) byScreen.set(screen, []);
    byScreen.get(screen)!.push(entry);
  }

  const lines: string[] = [
    "",
    "ELEMENT REGISTRY (captured from live app via maestro hierarchy):",
    "Use exact text/id values from this registry — do NOT guess element labels.",
    "",
  ];

  for (const [screen, entries] of byScreen) {
    lines.push(`Screen: ${screen}`);
    for (const e of entries) {
      const parts: string[] = [];
      if (e.text) parts.push(`text="${e.text}"`);
      if (e.accessibilityId) parts.push(`id="${e.accessibilityId}"`);
      if (e.resourceId) parts.push(`resourceId="${e.resourceId}"`);
      lines.push(`  - ${parts.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function generateMaestroSteps(
  refinedTestCase: string,
  flowName: string,
  registry: MobileSelectorEntry[] = [],
): Promise<GenerationResult> {
  const ai = getClient();

  const registrySection = buildRegistrySection(registry);

  const prompt = `You are a Maestro mobile test automation expert. Convert the following test case into Maestro YAML commands for Android/iOS.
${registrySection}
MAESTRO COMMAND REFERENCE:
- Tap element by text:        - tapOn: "Button text"
- Tap by accessibility id:    - tapOn:\n    id: "accessibility-id"
- Tap by screen position:     - tapOn:\n    point: "50%,10%"
- Assert visible:             - assertVisible: "some text"
- Assert not visible:         - assertNotVisible: "some text"
- Type text:                  - inputText: "some text"
- Type env variable:          - inputText: \${PHONE_NUMBER}
- Scroll down:                - scroll
- Scroll until visible:       - scrollUntilVisible:\n    element:\n      text: "element text"
- Back button:                - back
- Hide keyboard:              - hideKeyboard
- Wait:                       - waitForAnimationToEnd
- Clear text field:           - clearText

RUNTIME VARIABLES (use exact syntax \${VAR_NAME}):
- Phone number   → \${PHONE_NUMBER}
- OTP code       → \${OTP}
- MPIN           → \${MPIN}
- Email          → \${EMAIL}
- Password       → \${PASSWORD}
- Any other tester-supplied value → \${UPPER_SNAKE_CASE}

RULES:
1. Each step = exactly ONE Maestro command (one YAML block)
2. BUTTONS, TABS, MENU ITEMS, LINKS: if the element text/id appears in the ELEMENT REGISTRY, use tapOn with that exact text or id
3. ICON BUTTONS and anything NOT in the registry: use tapOn with a point percentage — top-right corner icons ~"90%,8%", bottom-left ~"10%,92%", centre "50%,50%"
4. TEXT INPUT FIELDS (text boxes, search bars, text areas): ALWAYS tap by point percentage — NEVER tap by the label above the field or by placeholder text. After tapping, emit clearText (clears existing content) then inputText
5. After typing, use hideKeyboard if a keyboard would appear
6. Use assertVisible with exact text that appears on screen to verify navigation succeeded
7. Do NOT include appId or --- header — only the command snippets
8. Detect any tester-provided variables (amounts, names, phone numbers, etc.) and list them as detectedVariables
9. Variable keys must be UPPER_SNAKE_CASE
10. IMPORTANT: Authentication (login, phone number entry, OTP, MPIN, password) is handled automatically by a separate auth subflow that runs before your steps. Do NOT generate any login or authentication steps — start your steps from the post-login state of the app.

FLOW NAME: ${flowName}

TEST CASE:
${refinedTestCase}

Return a JSON object with this exact shape:
{
  "steps": [
    {
      "order": 1,
      "plainEnglish": "Tap the Skip button",
      "command": "- tapOn: \\"Skip\\"",
      "selectorUsed": null
    }
  ],
  "detectedVariables": [
    {
      "key": "PHONE_NUMBER",
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
  if (!raw) throw new Error("Gemini returned empty Maestro generation");

  const parsed = JSON.parse(raw) as GenerationResult;

  // Ensure PHONE_NUMBER is always in detectedVariables if any step uses it
  const usesPhone = parsed.steps.some((s) =>
    s.command.includes("${PHONE_NUMBER}"),
  );
  if (
    usesPhone &&
    !parsed.detectedVariables.find((v) => v.key === "PHONE_NUMBER")
  ) {
    parsed.detectedVariables.unshift({
      key: "PHONE_NUMBER",
      defaultValue: "",
      description: "Phone number for this test scenario",
    });
  }

  return parsed;
}

// ─── Regenerate a single Maestro step ────────────────────────────────────────

export async function regenerateMaestroStep(
  stepIndex: number,
  instruction: string,
  currentSteps: GeneratedStep[],
  registry: MobileSelectorEntry[] = [],
): Promise<GeneratedStep> {
  const ai = getClient();

  const stepToFix = currentSteps[stepIndex];
  const registrySection = buildRegistrySection(registry);

  const prompt = `You are a Maestro mobile test automation expert. Fix the following test step based on the tester's instruction.
${registrySection}
CURRENT STEP:
Plain English: ${stepToFix.plainEnglish}
Command: ${stepToFix.command}

TESTER'S CORRECTION:
${instruction}

Use exact element text/id values from the ELEMENT REGISTRY above if available. For elements not in the registry (icon buttons, unlabelled controls), use tapOn with a point percentage estimate.

Return a JSON object for the corrected step:
{
  "order": ${stepToFix.order},
  "plainEnglish": "corrected plain English description",
  "command": "- tapOn: \\"corrected\\"",
  "selectorUsed": null
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
  if (!raw) throw new Error("Gemini returned empty Maestro step regeneration");
  return JSON.parse(raw) as GeneratedStep;
}
