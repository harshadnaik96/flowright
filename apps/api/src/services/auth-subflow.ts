import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { EnvironmentAuth } from "@flowright/shared";

// Subflows are written relative to the API working directory.
// Maestro test commands reference them via relative path from the flow YAML.
const SUBFLOWS_DIR = join(process.cwd(), "subflows");

// ─── YAML builders ────────────────────────────────────────────────────────────

function buildCredentialsYaml(appId: string, hasMpin: boolean): string {
  const lines = [
    `# Auto-generated auth subflow — review tap targets for your app`,
    `appId: "${appId}"`,
    `---`,
    `- tapOn:`,
    `    text: "Phone"`,
    `- clearText`,
    `- inputText: "\${PHONE}"`,
    `- tapOn:`,
    `    text: "Get OTP"`,
    `- tapOn:`,
    `    text: "OTP"`,
    `- clearText`,
    `- inputText: "\${OTP}"`,
    `- tapOn:`,
    `    text: "Submit"`,
  ];

  if (hasMpin) {
    lines.push(
      `- tapOn:`,
      `    text: "MPIN"`,
      `- clearText`,
      `- inputText: "\${MPIN}"`,
      `- tapOn:`,
      `    text: "Confirm"`,
    );
  }

  return lines.join("\n") + "\n";
}

function buildEmailPasswordYaml(appId: string): string {
  const lines = [
    `# Auto-generated auth subflow — review tap targets for your app`,
    `appId: "${appId}"`,
    `---`,
    `- tapOn:`,
    `    text: "Email"`,
    `- clearText`,
    `- inputText: "\${EMAIL}"`,
    `- tapOn:`,
    `    text: "Password"`,
    `- clearText`,
    `- inputText: "\${PASSWORD}"`,
    `- tapOn:`,
    `    text: "Login"`,
  ];

  return lines.join("\n") + "\n";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a Maestro auth subflow YAML for a mobile environment.
 *
 * Returns the absolute path to the written file, or null if no subflow
 * is applicable (auth type "none", "sso", or "custom-script" — these have
 * no Maestro equivalent template).
 */
export async function generateAuthSubflow(
  envId: string,
  appId: string,
  auth: EnvironmentAuth
): Promise<string | null> {
  let yaml: string;

  if (auth.type === "credentials") {
    yaml = buildCredentialsYaml(appId, !!auth.mpin);
  } else if (auth.type === "email-password") {
    yaml = buildEmailPasswordYaml(appId);
  } else {
    // none | sso | custom-script — no Maestro subflow template applies
    return null;
  }

  await mkdir(SUBFLOWS_DIR, { recursive: true });

  const filename = `env-${envId}-auth.yaml`;
  const filePath = join(SUBFLOWS_DIR, filename);

  await writeFile(filePath, yaml, "utf-8");

  console.info(`[auth-subflow] wrote ${filePath}`);

  return filePath;
}

/**
 * Returns the Maestro `runFlow` preamble to prepend to a mobile flow YAML.
 * Callers should prepend this block when `env.authSubflowPath` is set.
 */
export function buildAuthSubflowPreamble(subflowPath: string): string {
  const lines = [
    `- runFlow:`,
    `    path: "${subflowPath}"`,
    `    env:`,
    `      PHONE: "\${PHONE}"`,
    `      OTP: "\${OTP}"`,
    `      MPIN: "\${MPIN}"`,
    `      EMAIL: "\${EMAIL}"`,
    `      PASSWORD: "\${PASSWORD}"`,
  ];
  return lines.join("\n") + "\n";
}
