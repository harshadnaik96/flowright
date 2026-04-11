#!/usr/bin/env node
import { execSync, spawnSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { startAgent } from "./connect";

// ─── Maestro auto-install ─────────────────────────────────────────────────────

function ensureMaestro(): void {
  // Maestro installs to ~/.maestro/bin — add it to PATH for this process
  // so it's found even if the tester hasn't reloaded their shell profile yet.
  const maestroBin = join(homedir(), ".maestro", "bin");
  process.env.PATH = `${maestroBin}${process.env.PATH ? `:${process.env.PATH}` : ""}`;

  try {
    execSync("maestro --version", { stdio: "ignore" });
    console.log("[flowright-agent] Maestro CLI ready.");
    return;
  } catch {
    // Not on PATH — install it
  }

  console.log("[flowright-agent] Maestro CLI not found. Installing...");
  const result = spawnSync(
    "/bin/sh",
    ["-c", 'curl -Ls "https://get.maestro.mobile.dev" | bash'],
    { stdio: "inherit" }
  );
  if (result.status === 0) {
    console.log("[flowright-agent] Maestro CLI installed successfully.");
  } else {
    console.error(
      "[flowright-agent] Failed to install Maestro CLI automatically.\n" +
      "  Install it manually: https://maestro.mobile.dev/getting-started/installing-maestro"
    );
    process.exit(1);
  }
  return;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.error("Flowright Agent — runs Maestro tests on behalf of the Flowright portal");
  console.error("");
  console.error("Usage:");
  console.error("  flowright-agent --server <url> --token <token>");
  console.error("");
  console.error("Options:");
  console.error("  --server, -s   Flowright server URL  (e.g. https://app.flowright.io)");
  console.error("  --token,  -t   Agent token           (generate one in Settings → Agent)");
  console.error("");
  console.error("Example:");
  console.error("  flowright-agent --server https://app.flowright.io --token ft_xxxxxxxxxxxx");
}

function parseArgs(): { server: string; token: string } {
  const args = process.argv.slice(2);
  const rest = args[0] === "start" ? args.slice(1) : args;

  let server = "";
  let token = "";

  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--server" || rest[i] === "-s") server = rest[++i] ?? "";
    if (rest[i] === "--token"  || rest[i] === "-t") token  = rest[++i] ?? "";
  }

  if (!server || !token) {
    printUsage();
    process.exit(1);
  }

  return { server: server.replace(/\/$/, ""), token };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const { server, token } = parseArgs();
ensureMaestro();
startAgent({ serverUrl: server, token });
