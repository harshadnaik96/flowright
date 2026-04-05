"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Pencil, Trash2, Loader2, AlertTriangle, SquareCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

type Props = {
  projectId: string
  flowId: string
  flowName: string
}

export function FlowActions({ projectId, flowId, flowName }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await api.flows.delete(flowId)
      router.push(`/projects/${projectId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <p className="text-xs text-destructive flex-1">
          Delete &ldquo;{flowName}&rdquo; and all its run history?
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
          className="h-7 text-xs"
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="h-7 text-xs"
        >
          Cancel
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/projects/${projectId}/flows/${flowId}/edit`}>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </Link>
      <Link href={`/projects/${projectId}/flows/${flowId}/bulk-edit`}>
        <Button variant="outline" size="sm">
          <SquareCode className="h-3.5 w-3.5" />
          Bulk Edit
        </Button>
      </Link>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  )
}
