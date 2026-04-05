"use client"

import { useState } from "react"
import { Pencil, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface Step {
  order: number
  plainEnglish: string
  cypressCommand: string
  selectorUsed: string | null
}

interface StepRowProps {
  step: Step
  index: number
  showCode: boolean
  isRegenerating: boolean
  onRegenerate: (index: number, instruction: string) => Promise<void>
}

export function StepRow({
  step,
  index,
  showCode,
  isRegenerating,
  onRegenerate,
}: StepRowProps) {
  const [isFixing, setIsFixing] = useState(false)
  const [instruction, setInstruction] = useState("")

  async function handleFix() {
    if (!instruction.trim()) return
    await onRegenerate(index, instruction)
    setInstruction("")
    setIsFixing(false)
  }

  return (
    <div className="group rounded-lg border bg-card p-3 space-y-2 transition-colors hover:border-primary/30">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
          {step.order}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm">{step.plainEnglish}</p>
          {showCode && (
            <pre className="mt-1.5 rounded bg-muted px-2 py-1.5 text-xs font-mono overflow-x-auto text-muted-foreground">
              {step.cypressCommand}
            </pre>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
          onClick={() => setIsFixing((v) => !v)}
          disabled={isRegenerating}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isFixing && (
        <div className="flex items-center gap-2 pl-8">
          <Input
            placeholder='e.g. "The button is called Send OTP, not Submit"'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFix() }}
            className="text-xs h-8"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8 shrink-0"
            onClick={handleFix}
            disabled={!instruction.trim() || isRegenerating}
          >
            {isRegenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => { setIsFixing(false); setInstruction("") }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
