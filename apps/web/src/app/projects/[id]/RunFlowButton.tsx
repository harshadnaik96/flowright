"use client"

import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import { useRouter } from "next/navigation"

export function RunFlowButton({ projectId, flowId }: { projectId: string; flowId: string }) {
  const router = useRouter()

  return (
    <Button
      size="sm"
      className="h-7 text-xs"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        router.push(`/projects/${projectId}/flows/${flowId}?run=true`)
      }}
    >
      <Play className="h-3 w-3 mr-1" /> Run
    </Button>
  )
}
