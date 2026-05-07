import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play, RotateCcw, CheckCircle2, XCircle, Clock, AlertTriangle, GitMerge } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { FlowActions } from "./FlowActions"
import { PrerequisiteSelector } from "./PrerequisiteSelector"
import type { TestRun, Environment, Flow } from "@flowright/shared"

async function getData(projectId: string, flowId: string) {
  try {
    const [flow, runs, environments, allFlows] = await Promise.all([
      api.flows.get(flowId),
      api.runner.list(flowId).catch(() => [] as TestRun[]),
      api.environments.list(projectId).catch(() => [] as Environment[]),
      api.flows.list(projectId).catch(() => [] as Flow[]),
    ])
    return { flow, runs, environments, allFlows }
  } catch {
    return null
  }
}

function RunStatusIcon({ status }: { status: TestRun["status"] }) {
  if (status === "passed")  return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
  if (status === "failed")  return <XCircle className="h-4 w-4 text-destructive shrink-0" />
  if (status === "error")   return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
  if (status === "running") return <Clock className="h-4 w-4 text-primary shrink-0 animate-pulse" />
  return <Clock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
}

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ id: string; flowId: string }>
}) {
  const { id: projectId, flowId } = await params
  const data = await getData(projectId, flowId)
  if (!data) notFound()

  const { flow, runs, environments, allFlows } = data
  // Exclude the current flow from the prerequisite options to prevent self-reference
  const prerequisiteOptions = allFlows.filter((f) => f.id !== flowId)

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
                    {step.command}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prerequisite */}
        {prerequisiteOptions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Prerequisite flow</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Steps from the selected flow run first in the same browser session — useful for logging in before testing protected pages.
              </p>
              <PrerequisiteSelector
                flowId={flowId}
                currentPrerequisiteId={flow.prerequisiteFlowId}
                availableFlows={prerequisiteOptions}
              />
            </div>
          </>
        )}

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

        {/* Run History */}
        {runs.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-3">Run History</p>
              <div className="space-y-2">
                {runs.slice(0, 8).map((run) => {
                  const envName = environments.find((e) => e.id === run.environmentId)?.name ?? "Unknown env"
                  const vars = run.runtimeVariables as Record<string, string>
                  const rerunParams = new URLSearchParams({ envId: run.environmentId })
                  if (Object.keys(vars).length > 0) {
                    rerunParams.set("vars", Buffer.from(JSON.stringify(vars)).toString("base64"))
                  }
                  return (
                    <div key={run.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
                      <RunStatusIcon status={run.status} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-muted-foreground truncate">{envName}</span>
                        <p className="text-xs text-muted-foreground/60">
                          {new Date(run.startedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          run.status === "passed"
                            ? "border-green-500/30 text-green-600 bg-green-500/5 text-[10px]"
                            : run.status === "failed" || run.status === "error"
                            ? "border-destructive/30 text-destructive bg-destructive/5 text-[10px]"
                            : "text-[10px]"
                        }
                      >
                        {run.status}
                      </Badge>
                      {flow.status === "approved" && (
                        <Link href={`/projects/${projectId}/flows/${flowId}/run?${rerunParams}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary">
                            <RotateCcw className="h-3 w-3" /> Re-run
                          </Button>
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
