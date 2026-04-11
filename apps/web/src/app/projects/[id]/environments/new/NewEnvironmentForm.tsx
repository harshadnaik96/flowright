"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Info, Loader2 } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import type { AuthType, Platform } from "@flowright/shared"

const WEB_AUTH_TYPES: { value: AuthType; label: string; description: string }[] = [
  { value: "none",          label: "None",               description: "Public app, no login required" },
  { value: "credentials",   label: "Phone + OTP + MPIN", description: "Login with phone number, OTP, and MPIN" },
  { value: "email-password",label: "Email + Password",   description: "Login with email and password" },
  { value: "sso",           label: "SSO",                description: "Login via SSO — use a captured storage state" },
  { value: "custom-script", label: "Custom Script",      description: "Run a custom Playwright login script" },
]

const MOBILE_AUTH_TYPES: { value: AuthType; label: string; description: string }[] = [
  { value: "none",          label: "None",               description: "Public app, no login required" },
  { value: "credentials",   label: "Phone + OTP + MPIN", description: "Auto-generates a Maestro auth subflow at crawl time" },
  { value: "email-password",label: "Email + Password",   description: "Auto-generates a Maestro auth subflow at crawl time" },
]

type Props = {
  projectId: string
  platform: Platform
}

export function NewEnvironmentForm({ projectId, platform }: Props): React.JSX.Element {
  const router = useRouter()
  const isMobile = platform === "android" || platform === "ios"
  const authTypes = isMobile ? MOBILE_AUTH_TYPES : WEB_AUTH_TYPES

  const [name, setName] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [authType, setAuthType] = useState<AuthType>("none")

  const [phoneNumber, setPhoneNumber] = useState("")
  const [otp, setOtp] = useState("123456")
  const [mpin, setMpin] = useState("")
  const [storageState, setStorageState] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginScript, setLoginScript] = useState("")
  const [seedUrls, setSeedUrls] = useState("")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function buildAuth() {
    switch (authType) {
      case "credentials":
        return { type: authType, ...(phoneNumber && { phoneNumber }), otp: otp || "123456", ...(mpin && { mpin }) }
      case "email-password":
        return { type: authType, ...(email && { email }), ...(password && { password }) }
      case "sso":
        return { type: authType, storageState, capturedAt: new Date().toISOString() }
      case "custom-script":
        return { type: authType, loginScript }
      default:
        return { type: authType }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !baseUrl.trim()) return

    setIsSubmitting(true)
    setError(null)

    const auth = buildAuth()
    const parsedSeedUrls = seedUrls.split("\n").map((u) => u.trim()).filter(Boolean)

    try {
      await api.environments.create(projectId, {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        auth,
        seedUrls: parsedSeedUrls,
      })
      router.push(`/projects/${projectId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create environment")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">New Environment</h1>
            <p className="text-sm text-muted-foreground">
              {isMobile
                ? "Configure an app package and auth for mobile crawling and testing"
                : "Configure an app URL and auth for crawling and running tests"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g. dev, staging"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="baseUrl">{isMobile ? "App ID" : "Base URL"}</Label>
              {isMobile && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  The package name of your app (e.g.{" "}
                  <code className="font-mono">com.example.app</code>). Ensure the app is
                  installed on the connected device or emulator before crawling.
                </p>
              )}
              <Input
                id="baseUrl"
                placeholder={isMobile ? "com.example.app" : "https://app.example.com"}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Auth type</Label>
            <div className="grid gap-2">
              {authTypes.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    authType === t.value ? "border-primary bg-primary/5" : "hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="authType"
                    value={t.value}
                    checked={authType === t.value}
                    onChange={() => setAuthType(t.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {authType === "credentials" && (
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="phoneNumber">Crawler phone number</Label>
                  <p className="text-xs text-muted-foreground">Used by the crawler to log in — not exposed to testers</p>
                  <Input id="phoneNumber" placeholder="9999999999" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="otp">OTP (fixed test value)</Label>
                  <Input id="otp" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mpin">MPIN (optional)</Label>
                  <p className="text-xs text-muted-foreground">Leave blank if your app doesn&apos;t use MPIN</p>
                  <Input id="mpin" placeholder="1234" value={mpin} onChange={(e) => setMpin(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}

          {authType === "email-password" && (
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email / Username</Label>
                  <p className="text-xs text-muted-foreground">Used by the crawler to log in</p>
                  <Input id="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}

          {authType === "sso" && (
            <Card>
              <CardContent className="pt-4 space-y-1.5">
                <Label htmlFor="storageState">Playwright storage state (JSON)</Label>
                <p className="text-xs text-muted-foreground">Paste the output of <code className="font-mono">context.storageState()</code></p>
                <textarea
                  id="storageState"
                  className="w-full min-h-32 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder='{"cookies": [], "origins": []}'
                  value={storageState}
                  onChange={(e) => setStorageState(e.target.value)}
                />
              </CardContent>
            </Card>
          )}

          {authType === "custom-script" && (
            <Card>
              <CardContent className="pt-4 space-y-1.5">
                <Label htmlFor="loginScript">Login script (Playwright JS)</Label>
                <p className="text-xs text-muted-foreground">Async function with <code className="font-mono">(page, baseUrl)</code> args</p>
                <textarea
                  id="loginScript"
                  className="w-full min-h-40 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`await page.goto(baseUrl + '/login')\nawait page.fill('#email', 'test@example.com')\nawait page.fill('#password', 'secret')\nawait page.click('button[type=submit]')`}
                  value={loginScript}
                  onChange={(e) => setLoginScript(e.target.value)}
                />
              </CardContent>
            </Card>
          )}

          {!isMobile && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="seedUrls">Seed URLs (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Pages the crawler can&apos;t reach from the base URL — one per line
                </p>
                <textarea
                  id="seedUrls"
                  className="w-full min-h-20 rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={`https://app.example.com/dashboard\nhttps://app.example.com/settings`}
                  value={seedUrls}
                  onChange={(e) => setSeedUrls(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3">
            <Link href={`/projects/${projectId}`}>
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create Environment"}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
