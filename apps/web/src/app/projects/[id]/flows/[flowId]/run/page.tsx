import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { RunFlow } from "@/components/flow/RunFlow"
import { api } from "@/lib/api"

async function getData(projectId: string, flowId: string) {
  try {
    const [flow, environments, project, agents] = await Promise.all([
      api.flows.get(flowId),
      api.environments.list(projectId),
      api.projects.get(projectId),
      api.runner.agents().catch(() => []),
    ])
    return { flow, environments, project, agents }
  } catch {
    return null
  }
}

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; flowId: string }>
  searchParams: Promise<{ envId?: string; vars?: string }>
}) {
  const { id: projectId, flowId } = await params
  const { envId: preEnvId, vars: encodedVars } = await searchParams
  const data = await getData(projectId, flowId)
  if (!data) notFound()

  const { flow, environments, project, agents } = data
  const isMobile = project.platform === "android" || project.platform === "ios"

  // Decode pre-filled vars from re-run link (base64 JSON)
  let initialVarValues: Record<string, string> | undefined
  if (encodedVars) {
    try {
      initialVarValues = JSON.parse(Buffer.from(encodedVars, "base64").toString())
    } catch { /* ignore malformed params */ }
  }

  if (flow.status !== "approved") {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-sm text-muted-foreground">
            Only approved flows can be run. This flow is <strong>{flow.status}</strong>.
          </p>
          <Link href={`/projects/${projectId}/flows/${flowId}`}>
            <Button variant="outline" size="sm">Back to flow</Button>
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}/flows/${flowId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{flow.name}</h1>
            <p className="text-sm text-muted-foreground">Run flow</p>
          </div>
        </div>

        {/* Run wizard */}
        <RunFlow
          flowId={flowId}
          flowName={flow.name}
          variables={flow.variables ?? []}
          totalSteps={flow.steps?.length ?? 0}
          isMobile={isMobile}
          environments={environments.map((e) => ({
            id: e.id,
            name: e.name,
            baseUrl: e.baseUrl,
          }))}
          stepSummaries={(flow.steps ?? []).map((s) => ({
            id: s.id,
            order: s.order,
            plainEnglish: s.plainEnglish,
            command: s.command,
          }))}
          agents={isMobile ? agents : undefined}
          initialEnvId={preEnvId}
          initialVarValues={initialVarValues}
        />
      </div>
    </AppShell>
  )
}
