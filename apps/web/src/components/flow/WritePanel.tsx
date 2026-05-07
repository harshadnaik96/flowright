"use client"

import Link from "next/link"
import { useEffect, useRef } from "react"
import { Sparkles, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Environment } from "@flowright/shared"

interface WritePanelProps {
  flowName: string
  rawInput: string
  environmentId: string
  environments: Environment[]
  isRefining: boolean
  error: string | null
  projectId: string
  onFlowNameChange: (v: string) => void
  onRawInputChange: (v: string) => void
  onEnvironmentChange: (v: string) => void
  onRefine: () => void
}

export function WritePanel({
  flowName,
  rawInput,
  environmentId,
  environments,
  isRefining,
  error,
  projectId,
  onFlowNameChange,
  onRawInputChange,
  onEnvironmentChange,
  onRefine,
}: WritePanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus the flow name on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const canSubmit = rawInput.trim() && flowName.trim() && environmentId && !isRefining

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
      onRefine()
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Write your test case</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Describe what you want to test in plain English. Don&apos;t worry about being precise — Flowright will refine it.
        </p>
      </div>

      {environments.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">No environments yet</p>
            <p className="text-amber-600/80 dark:text-amber-500/80 text-xs mt-0.5">
              You need at least one environment (a base URL + auth config) before generating a flow.{" "}
              <Link href={`/projects/${projectId}/environments/new`} className="underline underline-offset-2 font-medium">
                Set one up →
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="flow-name">Flow name</Label>
          <Input
            id="flow-name"
            placeholder="e.g. Merchant KYC Submission"
            value={flowName}
            onChange={(e) => onFlowNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="environment">Environment</Label>
          <Select value={environmentId} onValueChange={onEnvironmentChange} disabled={environments.length === 0}>
            <SelectTrigger id="environment">
              <SelectValue placeholder={environments.length === 0 ? "No environments" : "Select environment"} />
            </SelectTrigger>
            <SelectContent>
              {environments.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name} — {env.baseUrl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="raw-input">Test case</Label>
        <Textarea
          ref={textareaRef}
          id="raw-input"
          placeholder={`e.g.\nLogin with merchant number and navigate to KYC section.\nUpload the required documents and submit.\nCheck that the status shows "Under Review".`}
          value={rawInput}
          onChange={(e) => onRawInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[200px] font-mono text-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground/60 hidden sm:block">
          {canSubmit ? "⌘↵ to refine" : ""}
        </span>
        <Button onClick={onRefine} disabled={!canSubmit}>
          {isRefining ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Refining…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Refine</>
          )}
        </Button>
      </div>
    </div>
  )
}
