"use client"

import { useState } from "react"
import { ArrowLeft, CheckCircle2, Code2, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { StepRow, type Step } from "./StepRow"
import type { FlowVariable } from "@flowright/shared"

interface StepsPanelProps {
  steps: Step[]
  variables: FlowVariable[]
  isApproving: boolean
  isRegeneratingIndex: number | null
  error: string | null
  onVariableChange: (key: string, value: string) => void
  onRegenerate: (index: number, instruction: string) => Promise<void>
  onBack: () => void
  onApprove: (andRun?: boolean) => void
}

export function StepsPanel({
  steps,
  variables,
  isApproving,
  isRegeneratingIndex,
  error,
  onVariableChange,
  onRegenerate,
  onBack,
  onApprove,
}: StepsPanelProps) {
  const [showCode, setShowCode] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Review generated steps</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {steps.length} steps generated. Review each step — click the edit icon to fix any that look wrong.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCode((v) => !v)}
        >
          <Code2 className="h-3.5 w-3.5" />
          {showCode ? "Hide code" : "Show code"}
        </Button>
      </div>

      <div className="space-y-2">
        {steps.map((step, i) => (
          <StepRow
            key={step.order}
            step={step}
            index={i}
            showCode={showCode}
            isRegenerating={isRegeneratingIndex === i}
            onRegenerate={onRegenerate}
          />
        ))}
      </div>

      {variables.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Variables detected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These values will be asked at run time. Set a default below.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {variables.map((v) => (
                <div key={v.key} className="space-y-1.5">
                  <Label className="text-xs font-mono">{v.key}</Label>
                  {v.description && (
                    <p className="text-xs text-muted-foreground">{v.description}</p>
                  )}
                  <Input
                    placeholder={`Default value for ${v.key}`}
                    value={v.defaultValue}
                    onChange={(e) => onVariableChange(v.key, e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={isApproving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onApprove(false)} disabled={isApproving}>
            {isApproving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Approve</>
            )}
          </Button>
          <Button onClick={() => onApprove(true)} disabled={isApproving}>
            {isApproving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Approving…</>
            ) : (
              <><Play className="h-4 w-4" /> Approve &amp; Run</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
