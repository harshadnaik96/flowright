"use client"

import { useState } from "react"
import {
  Plus, Trash2, Copy, Check, Loader2,
  Wifi, WifiOff, Terminal, KeyRound, Clock, Download, Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentToken = {
  id: string
  name: string
  createdAt: string
  lastConnectedAt: string | null
  online: boolean
}

type Props = {
  initialTokens: AgentToken[]
}

// ─── Copy-once token reveal ───────────────────────────────────────────────────

function TokenReveal({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <KeyRound className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">Copy this token now — you won&apos;t see it again.</p>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all select-all">
            {token}
          </code>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={copy}
            aria-label="Copy token"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use it to start the agent: <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">flowright-agent --server &lt;url&gt; --token {token.slice(0, 12)}…</code>
        </p>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={onDismiss}>
          I&apos;ve saved it
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({
  token,
  onRevoke,
}: {
  token: AgentToken
  onRevoke: (id: string) => void
}) {
  const [revoking, setRevoking] = useState(false)

  const handleRevoke = async () => {
    if (!confirm(`Revoke "${token.name}"? The agent using this token will be disconnected.`)) return
    setRevoking(true)
    try {
      await api.agentTokens.revoke(token.id)
      onRevoke(token.id)
    } catch {
      setRevoking(false)
    }
  }

  const lastSeen = token.lastConnectedAt
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.round((new Date(token.lastConnectedAt).getTime() - Date.now()) / 60000),
        "minute"
      )
    : "never"

  return (
    <div className="flex items-center gap-4 py-3">
      {/* Online indicator */}
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          token.online ? "bg-green-500" : "bg-muted-foreground/30"
        )}
        aria-label={token.online ? "Online" : "Offline"}
      />

      {/* Name + last seen */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{token.name}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {token.online ? (
            <span className="text-green-600 font-medium">Connected now</span>
          ) : (
            <span>Last seen {lastSeen}</span>
          )}
        </div>
      </div>

      {/* Revoke */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
        onClick={handleRevoke}
        disabled={revoking}
        aria-label={`Revoke ${token.name}`}
      >
        {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentSettings({ initialTokens }: Props) {
  const [tokens, setTokens] = useState<AgentToken[]>(initialTokens)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealToken, setRevealToken] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const result = await api.agentTokens.create(newName.trim())
      setTokens((prev) => [
        ...prev,
        { id: result.id, name: result.name, createdAt: result.createdAt, lastConnectedAt: null, online: false },
      ])
      setRevealToken(result.token)
      setNewName("")
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create token")
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = (id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  const anyOnline = tokens.some((t) => t.online)

  return (
    <div className="space-y-6">
      {/* One-time token reveal */}
      {revealToken && (
        <TokenReveal token={revealToken} onDismiss={() => setRevealToken(null)} />
      )}

      {/* Token list */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Tokens</h2>
            {anyOnline && (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <Wifi className="h-3 w-3" /> Agent online
              </span>
            )}
            {!anyOnline && tokens.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="h-3 w-3" /> No agent connected
              </span>
            )}
          </div>
          {!creating && (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New Token
            </Button>
          )}
        </div>

        {/* Create form */}
        {creating && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="token-name" className="text-xs">Token name (e.g. &quot;Harshad&apos;s MacBook&quot;)</Label>
              <Input
                id="token-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") { setCreating(false); setNewName("") }
                }}
                placeholder="My MacBook"
                autoFocus
                className="h-8 text-sm"
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()} className="mt-5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCreating(false); setNewName("") }}
              className="mt-5"
            >
              Cancel
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}

        {/* Token rows */}
        {tokens.length === 0 && !creating ? (
          <p className="text-sm text-muted-foreground py-4">
            No tokens yet. Create one for each tester&apos;s machine.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {tokens.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Install section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Install the agent</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Download the binary for your platform. It bundles everything — Maestro CLI is installed
          automatically on first run.
        </p>

        {/* Download buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "macOS (Apple Silicon)", binary: "flowright-agent-macos-arm64" },
            { label: "macOS (Intel)", binary: "flowright-agent-macos-x64" },
            { label: "Linux x64", binary: "flowright-agent-linux-x64" },
          ].map(({ label, binary }) => (
            <a
              key={binary}
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/downloads/${binary}`}
              download={binary}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" />
              {label}
            </a>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Then run it with your token:</p>

          {/* Step 1 — chmod + quarantine */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">1. Make it executable and allow it to run on macOS:</p>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs space-y-1">
              <div className="flex items-start gap-2">
                <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                <code className="text-foreground break-all">
                  <span className="text-muted-foreground"># Make executable</span>
                  <br />
                  chmod +x ~/Downloads/flowright-agent-macos-arm64
                  <br />
                  <br />
                  <span className="text-muted-foreground"># Remove macOS quarantine (required on Mac)</span>
                  <br />
                  xattr -dr com.apple.quarantine ~/Downloads/flowright-agent-macos-arm64
                </code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              macOS blocks unsigned binaries by default. The second command removes the quarantine flag so Gatekeeper allows it to run.
            </p>
          </div>

          {/* Step 2 — run */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">2. Start the agent:</p>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
              <div className="flex items-start gap-2">
                <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                <code className="text-foreground break-all">
                  {"~/Downloads/flowright-agent-macos-arm64 \\"}
                  <br />
                  {"  --server "}
                  <span className="text-blue-600 dark:text-blue-400">{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}</span>
                  {" \\"}
                  <br />
                  {"  --token "}
                  <span className="text-amber-600 dark:text-amber-400">{"<your-token>"}</span>
                </code>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Keep it running in the background while testing — it auto-reconnects if the connection drops.
          </p>
        </div>
      </div>

      <Separator />

      {/* Stop & Uninstall */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Square className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Stop &amp; Uninstall</h2>
        </div>

        {/* Stop */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Stopping the agent</p>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              If running in the foreground (terminal open):
            </p>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <code className="text-foreground">Ctrl+C</code>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              If sent to the background:
            </p>
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <code className="text-foreground break-all">kill $(pgrep -f flowright-agent)</code>
            </div>
          </div>
        </div>

        {/* Uninstall */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Uninstalling</p>
          <p className="text-xs text-muted-foreground">
            The agent writes no config files or services. Simply delete the binary and, optionally, Maestro.
          </p>
          <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs space-y-1">
            <div className="flex items-start gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
              <code className="text-foreground break-all">
                <span className="text-muted-foreground"># Remove the agent binary</span>
                <br />
                {"rm ~/Downloads/flowright-agent-macos-arm64"}
                <br />
                <br />
                <span className="text-muted-foreground"># Optional: remove Maestro CLI too</span>
                <br />
                {"rm -rf ~/.maestro"}
              </code>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Temp files written during test runs are stored in <code className="font-mono bg-muted px-1 py-0.5 rounded text-[11px]">/tmp/flowright-agent/</code> and are cleaned up automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
