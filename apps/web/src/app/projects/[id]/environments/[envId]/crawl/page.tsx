"use client"

import { use, useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Loader2, CheckCircle2, Database } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import type { Environment, SelectorRegistry, MobileSelectorEntry } from "@flowright/shared"

export default function CrawlPage({
  params,
}: {
  params: Promise<{ id: string; envId: string }>
}) {
  const { id: projectId, envId } = use(params)

  const [env, setEnv] = useState<Environment | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [registry, setRegistry] = useState<SelectorRegistry | null>(null)
  const [isCrawling, setIsCrawling] = useState(false)
  const [crawlResult, setCrawlResult] = useState<{ entriesFound: number; crawledAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.environments.get(projectId, envId),
      api.projects.get(projectId),
    ])
      .then(([envData, projectData]) => {
        setEnv(envData)
        setIsMobile(projectData.platform === "android" || projectData.platform === "ios")
      })
      .catch(() => setError("Failed to load environment"))

    api.crawler.registry(envId)
      .then(setRegistry)
      .catch(() => { /* no registry yet — that's fine */ })
  }, [projectId, envId])

  const handleCrawl = async () => {
    setIsCrawling(true)
    setError(null)
    setCrawlResult(null)

    try {
      const result = await api.crawler.crawl(envId)
      setCrawlResult({ entriesFound: result.entriesFound, crawledAt: result.crawledAt })
      // Refresh registry
      const updated = await api.crawler.registry(envId)
      setRegistry(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crawl failed")
    } finally {
      setIsCrawling(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Crawl — {env?.name ?? "…"}</h1>
            <p className="text-sm text-muted-foreground">{env?.baseUrl}</p>
          </div>
        </div>

        {/* Current registry status */}
        <Card>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Selector registry</p>
                {registry ? (
                  <p className="text-xs text-muted-foreground">
                    {registry.entries.length} selectors — last crawled{" "}
                    {new Date(registry.crawledAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No registry yet — run a crawl first</p>
                )}
              </div>
            </div>
            {registry && (
              <Badge variant="outline" className="text-xs">
                {registry.entries.length} entries
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Crawl action */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Run crawl</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isMobile
                ? "Open your app on the connected device to the home screen, then press Crawl. Flowright will capture the current screen and navigate through tabs to build an element registry."
                : "Flowright will launch a headless browser, log in using your environment's auth config, and extract all interactive elements from every page."}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}

          {crawlResult && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Crawl complete — {crawlResult.entriesFound} selectors found
            </div>
          )}

          <Button onClick={handleCrawl} disabled={isCrawling || !env}>
            {isCrawling ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Crawling…</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> {registry ? "Re-crawl" : "Start Crawl"}</>
            )}
          </Button>
        </div>

        {/* Registry preview */}
        {registry && registry.entries.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-3">Registry preview</p>
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {registry.entries.slice(0, 50).map((entry, i) => {
                  const mobileEntry = entry as unknown as MobileSelectorEntry
                  const isMobileEntry = !("selector" in entry)
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-xs"
                    >
                      <Badge variant="outline" className="text-xs shrink-0 capitalize">
                        {isMobileEntry ? (mobileEntry.screen ?? "app") : entry.elementType}
                      </Badge>
                      <span className="font-medium truncate flex-1">{entry.label}</span>
                      <code className="text-muted-foreground font-mono truncate max-w-48">
                        {isMobileEntry
                          ? (mobileEntry.accessibilityId ?? mobileEntry.resourceId ?? mobileEntry.text ?? "")
                          : entry.selector}
                      </code>
                    </div>
                  )
                })}
                {registry.entries.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {registry.entries.length - 50} more entries
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
