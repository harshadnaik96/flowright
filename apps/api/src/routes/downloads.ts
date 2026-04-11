import type { FastifyInstance } from "fastify";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join } from "path";

// Binaries are built by: cd apps/agent && pnpm bundle
// process.cwd() when the API runs is apps/api/, so ../agent/bin resolves correctly.
const AGENT_BIN_DIR =
  process.env.AGENT_BIN_DIR ?? join(process.cwd(), "../agent/bin");

const ALLOWED_BINARIES = [
  "flowright-agent-macos-arm64",
  "flowright-agent-macos-x64",
  "flowright-agent-linux-x64",
] as const;

// ─── Install script (served at GET /install.sh) ───────────────────────────────

function buildInstallScript(serverUrl: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail

FLOWRIGHT_SERVER="\${FLOWRIGHT_SERVER:-${serverUrl}}"
FLOWRIGHT_TOKEN="\${FLOWRIGHT_TOKEN:?Set FLOWRIGHT_TOKEN — generate one in Settings \u2192 Agent}"

# ─── Detect platform ──────────────────────────────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS-$ARCH" in
  Darwin-arm64)  BINARY="flowright-agent-macos-arm64" ;;
  Darwin-x86_64) BINARY="flowright-agent-macos-x64"   ;;
  Linux-x86_64)  BINARY="flowright-agent-linux-x64"   ;;
  *)
    echo "\u2717 Unsupported platform: $OS $ARCH" >&2
    exit 1
    ;;
esac

# ─── Install Maestro CLI ──────────────────────────────────────────────────────
if command -v maestro &>/dev/null; then
  echo "\u2713 Maestro CLI already installed"
else
  echo "\u2192 Installing Maestro CLI..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$HOME/.maestro/bin:$PATH"
  echo "\u2713 Maestro CLI installed"
  echo "  Add to your shell profile: export PATH=\\"\\\$HOME/.maestro/bin:\\\$PATH\\""
fi

# ─── Download Flowright agent ─────────────────────────────────────────────────
INSTALL_DIR="$HOME/.flowright"
AGENT_PATH="$INSTALL_DIR/flowright-agent"
mkdir -p "$INSTALL_DIR"

echo "\u2192 Downloading Flowright agent ($BINARY)..."
if ! curl -fLs "$FLOWRIGHT_SERVER/downloads/$BINARY" -o "$AGENT_PATH"; then
  echo "\u2717 Download failed. The server may not have prebuilt binaries yet." >&2
  echo "  Build manually: cd apps/agent && pnpm bundle" >&2
  exit 1
fi
chmod +x "$AGENT_PATH"
echo "\u2713 Agent installed to $AGENT_PATH"

# ─── Start agent ──────────────────────────────────────────────────────────────
echo "\u2192 Starting Flowright agent (Ctrl+C to stop)..."
exec "$AGENT_PATH" --server "$FLOWRIGHT_SERVER" --token "$FLOWRIGHT_TOKEN"
`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function downloadsRoutes(app: FastifyInstance) {
  // GET /install.sh — tester runs: curl -Ls <server>/install.sh | FLOWRIGHT_TOKEN=ft_... bash
  app.get("/install.sh", async (req, reply) => {
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:3001";
    const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
    const serverUrl = `${proto}://${host}`;

    reply
      .header("Content-Type", "text/plain; charset=utf-8")
      .header("Content-Disposition", "inline; filename=install.sh");
    return reply.send(buildInstallScript(serverUrl));
  });

  // GET /downloads/:binary — serve prebuilt agent binaries
  app.get<{ Params: { binary: string } }>(
    "/downloads/:binary",
    async (req, reply) => {
      const { binary } = req.params;

      if (!(ALLOWED_BINARIES as readonly string[]).includes(binary)) {
        return reply.status(404).send({ error: "Unknown binary" });
      }

      const filePath = join(AGENT_BIN_DIR, binary);

      try {
        const stats = await stat(filePath);
        reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", `attachment; filename="${binary}"`)
          .header("Content-Length", stats.size);
        return reply.send(createReadStream(filePath));
      } catch {
        return reply.status(404).send({
          error: "Binary not available. Build it first: cd apps/agent && pnpm bundle",
        });
      }
    }
  );
}
