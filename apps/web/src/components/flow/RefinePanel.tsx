"use client"

import { useState } from "react"
import { ArrowLeft, Wand2, Loader2, Pencil, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface RefinePanelProps {
  refinedText: string
  isGenerating: boolean
  error: string | null
  onRefinedTextChange: (v: string) => void
  onBack: () => void
  onGenerate: () => void
}

export function RefinePanel({
  refinedText,
  isGenerating,
  error,
  onRefinedTextChange,
  onBack,
  onGenerate,
}: RefinePanelProps) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review refined test case</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Flowright has structured your test case into clear steps. Review it, edit if needed, then generate executable steps.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/40 relative">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Refined Test Case
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing((v) => !v)}
          >
            {isEditing ? (
              <><Check className="h-3.5 w-3.5" /> Done</>
            ) : (
              <><Pencil className="h-3.5 w-3.5" /> Edit</>
            )}
          </Button>
        </div>

        {isEditing ? (
          <Textarea
            value={refinedText}
            onChange={(e) => onRefinedTextChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && refinedText.trim() && !isGenerating) {
                setIsEditing(false)
                onGenerate()
              }
            }}
            className="min-h-[300px] border-0 rounded-none rounded-b-lg bg-transparent font-mono text-sm focus-visible:ring-0"
          />
        ) : (
          <div className="px-4 py-4 text-sm whitespace-pre-wrap font-mono leading-relaxed min-h-[300px]">
            {refinedText}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={isGenerating}>
          <ArrowLeft className="h-4 w-4" /> Rewrite
        </Button>
        <div className="flex items-center gap-3">
          {!isGenerating && refinedText.trim() && (
            <span className="text-xs text-muted-foreground/60 hidden sm:block">⌘↵ to generate</span>
          )}
          <Button onClick={onGenerate} disabled={!refinedText.trim() || isGenerating}>
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating steps…</>
            ) : (
              <><Wand2 className="h-4 w-4" /> Generate Steps</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
