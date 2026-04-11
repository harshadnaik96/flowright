"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Wifi, WifiOff, Loader2 } from "lucide-react"
import { api } from "@/lib/api"

type Status = "checking" | "online" | "offline"

export function AgentStatusBanner() {
  const [status, setStatus] = useState<Status>("checking")

  const check = async () => {
    try {
      const tokens = await api.agentTokens.list()
      setStatus(tokens.some((t) => t.online) ? "online" : "offline")
    } catch {
      setStatus("offline")
    }
  }

  useEffect(() => {
    check()
    const id = setInterval(check, 5_000)
    return () => clearInterval(id)
  }, [])

  if (status === "checking") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking agent status…
      </div>
    )
  }

  if (status === "online") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/5 px-3 py-2 text-xs text-green-700 dark:text-green-400">
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        <span>Agent connected — ready to run on your device.</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <div className="flex items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>Agent offline — start it on your laptop before running.</span>
      </div>
      <Link
        href="/settings/agent"
        className="font-semibold underline underline-offset-2 hover:opacity-80 shrink-0 ml-3"
      >
        Settings →
      </Link>
    </div>
  )
}
