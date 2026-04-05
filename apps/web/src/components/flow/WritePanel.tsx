"use client"

import { Sparkles, Loader2 } from "lucide-react"
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
  onFlowNameChange,
  onRawInputChange,
  onEnvironmentChange,
  onRefine,
}: WritePanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Write your test case</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Describe what you want to test in plain English. Don&apos;t worry about being precise — Flowright will refine it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="flow-name">Flow name</Label>
          <Input
            id="flow-name"
            placeholder="e.g. Merchant KYC Submission"
            value={flowName}
            onChange={(e) => onFlowNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="environment">Environment</Label>
          <Select value={environmentId} onValueChange={onEnvironmentChange}>
            <SelectTrigger id="environment">
              <SelectValue placeholder="Select environment" />
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
          id="raw-input"
          placeholder={`e.g.\nLogin with merchant number and navigate to KYC section.\nUpload the required documents and submit.\nCheck that the status shows "Under Review".`}
          value={rawInput}
          onChange={(e) => onRawInputChange(e.target.value)}
          className="min-h-[200px] font-mono text-sm"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onRefine}
          disabled={!rawInput.trim() || !flowName.trim() || !environmentId || isRefining}
        >
          {isRefining ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Refining...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Refine</>
          )}
        </Button>
      </div>
    </div>
  )
}
