import Link from "next/link"
import { notFound } from "next/navigation"
import { Plus, RefreshCw, Cpu, Activity, Globe, Smartphone, ShieldCheck } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { api } from "@/lib/api"
import { DeleteStationButton } from "./DeleteStationButton"
import { FlowsSection } from "./FlowsSection"

async function getData(id: string) {
  try {
    const [project, environments, flows] = await Promise.all([
      api.projects.get(id),
      api.environments.list(id),
      api.flows.list(id),
    ])
    return { project, environments, flows }
  } catch {
    return null
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getData(id)
  if (!data) notFound()

  const { project, environments, flows } = data

  return (
    <AppShell>
      <div className="space-y-10">
        {/* Header Section */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-10 text-white shadow-2xl shadow-indigo-500/10">
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
                <Cpu className="h-4 w-4" />
                <span>Project Workspace</span>
              </div>
              <h1 className="text-4xl font-black tracking-tight">{project.name}</h1>
              {project.description && (
                <p className="text-slate-400 text-lg max-w-2xl font-medium tracking-tight">
                  {project.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
               <Link href={`/projects/${id}/flows/new`}>
                <Button className="bg-indigo-500 hover:bg-indigo-600 border-none shadow-lg shadow-indigo-500/30 font-bold px-6">
                  <Plus className="mr-2 h-4 w-4" /> New Flow
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Decorative background elements */}
          <div className="absolute -right-20 -top-20 h-64 w-64 bg-indigo-500/10 blur-[80px]" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 bg-blue-500/5 blur-[80px]" />
        </section>

        {/* Environments Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Activity className="h-5 w-5 text-indigo-500" />
              <h2 className="text-lg font-bold tracking-tight">Execution Environments</h2>
            </div>
            <Link href={`/projects/${id}/environments/new`}>
              <Button variant="ghost" size="sm" className="text-indigo-600 font-bold hover:text-indigo-700 hover:bg-indigo-50">
                <Plus className="mr-1.5 h-4 w-4" /> Add Station
              </Button>
            </Link>
          </div>
          
          {environments.length === 0 ? (
            <Card className="border-dashed border-2 bg-slate-50/50">
              <CardContent className="py-12 text-center">
                <Globe className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No target environments configured.</p>
                <Link href={`/projects/${id}/environments/new`}>
                  <Button variant="link" className="text-indigo-600 font-bold">Initialize your first station &rarr;</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {environments.map((env) => (
                <Card key={env.id} className="group relative overflow-hidden border-border/60 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300">
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight text-sm">{env.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium font-mono">
                          {project.platform === "web" ? <Globe className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                          <span className="truncate max-w-[140px]">
                            {project.platform === "web"
                              ? (() => { try { return new URL(env.baseUrl).hostname } catch { return env.baseUrl } })()
                              : env.baseUrl}
                          </span>
                        </div>
                      </div>
                              <div className="flex items-center gap-1">
                        <DeleteStationButton projectId={id} envId={env.id} envName={env.name} />
                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 border-none font-bold">
                          {env.auth?.type ?? "no-auth"}
                        </Badge>
                      </div>
                      <Link href={`/projects/${id}/environments/${env.id}/crawl`}>
                        <Button variant="outline" size="sm" className="h-8 rounded-lg font-bold border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200">
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Crawl
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Flows List Section */}
        <FlowsSection flows={flows} projectId={id} />
      </div>
    </AppShell>
  )
}
