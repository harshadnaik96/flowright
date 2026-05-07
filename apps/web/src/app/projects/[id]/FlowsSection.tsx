"use client"

import { useState } from "react"
import Link from "next/link"
import { FileText, Clock, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { RunFlowButton } from "./RunFlowButton"
import type { Flow } from "@flowright/shared"

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

type StatusFilter = "all" | Flow["status"]

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Approved", value: "approved" },
  { label: "Draft", value: "draft" },
  { label: "Archived", value: "archived" },
]

function FlowStatusBadge({ status }: { status: Flow["status"] }) {
  const map = {
    approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    draft: { label: "Draft", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    archived: { label: "Archived", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
  }
  const { label, className } = map[status]
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wider", className)}>
      {label}
    </Badge>
  )
}

type Props = {
  flows: Flow[]
  projectId: string
}

export function FlowsSection({ flows, projectId }: Props) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const filtered = flows.filter((flow) => {
    const matchesSearch = flow.name.toLowerCase().includes(search.toLowerCase()) ||
      flow.description?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || flow.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <section className="space-y-4 pb-20">
      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <p className="text-lg font-bold tracking-tight">
          Test Flows <span className="text-muted-foreground font-normal text-sm">({filtered.length}/{flows.length})</span>
        </p>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flows…"
              className="pl-8 h-8 text-sm w-48"
            />
          </div>
          {/* Status filter tabs */}
          <div className="flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  statusFilter === tab.value
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">
              {flows.length === 0 ? "Your flow registry is empty." : "No flows match your filter."}
            </p>
            {flows.length === 0 && (
              <Link href={`/projects/${projectId}/flows/new`}>
                <Button className="mt-4 bg-indigo-500 font-bold hover:bg-indigo-600">Generate First Flow</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((flow) => (
            <div key={flow.id} className="group relative flex items-center justify-between p-4 rounded-2xl border border-border/60 bg-white hover:bg-slate-50/50 hover:border-indigo-500/20 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-200">
              <Link href={`/projects/${projectId}/flows/${flow.id}`} className="flex-1 flex items-center gap-4 min-w-0">
                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{flow.name}</span>
                    <FlowStatusBadge status={flow.status} />
                  </div>
                  {flow.description && (
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{flow.description}</p>
                  )}
                </div>
              </Link>

              <div className="flex items-center gap-6 pl-4">
                <div className="hidden sm:flex flex-col items-end text-right">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    <Clock size={10} />
                    <span>Modified</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">{relativeTime(flow.updatedAt)}</span>
                </div>
                {flow.status === "approved" && (
                  <RunFlowButton projectId={projectId} flowId={flow.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
