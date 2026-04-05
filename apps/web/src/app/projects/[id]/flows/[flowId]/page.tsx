import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { FlowActions } from "./FlowActions"

async function getData(projectId: string, flowId: string) {
  try {
    const flow = await api.flows.get(flowId)
    return { flow }
  } catch {
    return null
  }
}

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string; flowId: string }>
}) {
  const { id: projectId, flowId } = await params
  const data = await getData(projectId, flowId)
  if (!data) notFound()

  const { flow } = data

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{flow.name}</h1>
              <Badge
                variant={
                  flow.status === "approved"
                    ? "success"
                    : flow.status === "draft"
                    ? "warning"
                    : "outline"
                }
              >
                {flow.status}
              </Badge>
            </div>
            {flow.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{flow.description}</p>
            )}
          </div>
          <FlowActions projectId={projectId} flowId={flowId} flowName={flow.name} />
        </div>

        {/* Steps */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">
            {flow.steps?.length ?? 0} steps
          </p>
          <div className="space-y-2">
            {(flow.steps ?? []).map((step) => (
              <div
                key={step.id}
                className="flex items-start gap-3 rounded-lg border bg-card p-3"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary mt-0.5">
                  {step.order}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{step.plainEnglish}</p>
                  <pre className="mt-1.5 rounded bg-muted px-2 py-1.5 text-xs font-mono overflow-x-auto text-muted-foreground">
                    {step.cypressCommand}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Variables */}
        {flow.variables?.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">Variables</p>
              <div className="flex flex-wrap gap-2">
                {flow.variables.map((v) => (
                  <div
                    key={v.key}
                    className="rounded-md border bg-muted px-3 py-1.5 text-xs font-mono"
                  >
                    <span className="text-primary">{v.key}</span>
                    {v.defaultValue && (
                      <span className="text-muted-foreground"> = {v.defaultValue}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Run section */}
        {flow.status === "approved" && (
          <>
            <Separator />
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4 flex items-center justify-between">
                <p className="text-sm font-medium">Ready to run</p>
                <Link href={`/projects/${projectId}/flows/${flowId}/run`}>
                  <Button>
                    <Play className="h-4 w-4" /> Run Flow
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}
