"use client"

import { useState } from "react"
import { Loader2, GitMerge, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { Flow } from "@flowright/shared"

type Props = {
  flowId: string
  currentPrerequisiteId: string | null | undefined
  availableFlows: Pick<Flow, "id" | "name">[]
}

export function PrerequisiteSelector({ flowId, currentPrerequisiteId, availableFlows }: Props) {
  const [selected, setSelected] = useState<string>(currentPrerequisiteId ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const hasChanged = selected !== (currentPrerequisiteId ?? "")

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.flows.setPrerequisite(flowId, selected || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.flows.setPrerequisite(flowId, null)
      setSelected("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setSaved(false) }}
          disabled={saving}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
        >
          <option value="">None — run this flow standalone</option>
          {availableFlows.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        {hasChanged && (
          <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        )}

        {!hasChanged && selected && (
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={handleClear} disabled={saving} aria-label="Clear prerequisite">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {saved && <p className="text-xs text-green-600">Prerequisite saved.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {selected && !hasChanged && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitMerge className="h-3.5 w-3.5" />
          Steps from <span className="font-medium text-foreground">{availableFlows.find((f) => f.id === selected)?.name}</span> will run first in the same browser session.
        </p>
      )}
    </div>
  )
}
