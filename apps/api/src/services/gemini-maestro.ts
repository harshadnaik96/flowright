import { GoogleGenAI, Type } from "@google/genai";
import type { FlowVariable } from "@flowright/shared";

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
// No selector registry needed — Maestro matches elements by text / accessibility id.
// Variables are passed as Maestro env vars: ${PHONE_NUMBER}, ${OTP}, etc.

export async function generateMaestroSteps(
  refinedTestCase: string,
  flowName: string,
): Promise<GenerationResult> {
  const ai = getClient();

  const prompt = `You are a Maestro mobile test automation expert. Convert the following test case into Maestro YAML commands for Android/iOS.

MAESTRO COMMAND REFERENCE:
- Tap element by text:      - tapOn: "Button text"
- Tap by accessibility id:  - tapOn:\n    id: "accessibility-id"
- Type text:                - inputText: "some text"
- Type env variable:        - inputText: \${PHONE_NUMBER}
- Assert visible:           - assertVisible: "some text"
- Assert not visible:       - assertNotVisible: "some text"
- Scroll down:              - scroll
- Scroll until visible:     - scrollUntilVisible:\n    element:\n      text: "element text"
- Back button:              - back
- Hide keyboard:            - hideKeyboard
- Wait:                     - waitForAnimationToEnd
- Clear text field:         - clearText

RUNTIME VARIABLES (use exact syntax \${VAR_NAME}):
- Phone number   → \${PHONE_NUMBER}
- OTP code       → \${OTP}
- MPIN           → \${MPIN}
- Email          → \${EMAIL}
- Password       → \${PASSWORD}
- Any other tester-supplied value → \${UPPER_SNAKE_CASE}

RULES:
1. Each step = exactly ONE Maestro command (one YAML block)
2. Prefer matching by visible text (tapOn: "text") over accessibility IDs
3. After tapping an input, use inputText to type
4. After typing, use hideKeyboard if a keyboard would appear
5. For assertions, use assertVisible with the exact text that would appear on screen
6. Do NOT include appId or --- header — only the command snippets
7. Detect any tester-provided variables (amounts, names, phone numbers, etc.) and list them as detectedVariables
8. Variable keys must be UPPER_SNAKE_CASE

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
): Promise<GeneratedStep> {
  const ai = getClient();

  const stepToFix = currentSteps[stepIndex];

  const prompt = `You are a Maestro mobile test automation expert. Fix the following test step based on the tester's instruction.

CURRENT STEP:
Plain English: ${stepToFix.plainEnglish}
Command: ${stepToFix.command}

TESTER'S CORRECTION:
${instruction}

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
