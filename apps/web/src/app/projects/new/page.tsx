"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, LayoutGrid, CheckCircle2, Loader2, Globe, Smartphone, Tablet } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { motion } from "framer-motion"
import type { Platform } from "@flowright/shared"

type PlatformOption = {
  value: Platform
  label: string
  icon: React.ElementType
  description: string
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: "web",     label: "Web",     icon: Globe,       description: "Browser-based testing via Playwright" },
  { value: "android", label: "Android", icon: Smartphone,  description: "Native Android app via Maestro CLI" },
  { value: "ios",     label: "iOS",     icon: Tablet,      description: "Native iOS app via Maestro CLI" },
]

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [platform, setPlatform] = useState<Platform>("web")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    try {
      const project = await api.projects.create({ name, description, platform })
      router.push(`/projects/${project.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project")
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors mb-2 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Link>

        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ type: "spring", stiffness: 300, damping: 24 }}
        >
          <Card className="glass-darker shadow-2xl shadow-indigo-500/10 border-indigo-100 overflow-hidden rounded-3xl">
            <div className="bg-primary/5 px-8 py-6 border-b border-indigo-100 flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">Create Workspace</CardTitle>
                <CardDescription className="text-slate-500 font-medium tracking-tight mt-1">Initialize a new project container for your flows.</CardDescription>
              </div>
              <div className="bg-white p-3 rounded-2xl shadow-inner border border-indigo-50">
                <LayoutGrid className="h-6 w-6 text-primary" />
              </div>
            </div>
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-slate-400">Project Name</Label>
                  <Input
                    id="name"
                    placeholder="BakBakAdmin, ShiftPro Staging, etc."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12 border-slate-200 focus:border-primary focus:ring-primary/20 rounded-xl px-4 font-medium"
                    autoFocus
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Platform</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {PLATFORM_OPTIONS.map(({ value, label, icon: Icon, description }) => {
                      const isSelected = platform === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPlatform(value)}
                          aria-pressed={isSelected}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          )}
                        >
                          <div className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                            isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                          )}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <span className={cn(
                            "text-sm font-bold leading-tight",
                            isSelected ? "text-primary" : "text-slate-700"
                          )}>
                            {label}
                          </span>
                          <span className="text-[10px] leading-tight text-slate-400 font-medium">
                            {description}
                          </span>
                          {isSelected && (
                            <div className="absolute right-2 top-2">
                              <CheckCircle2 className="h-4 w-4 text-primary" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-xs font-black uppercase tracking-widest text-slate-400">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Briefly describe the purpose of this project..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] border-slate-200 focus:border-primary focus:ring-primary/20 rounded-xl p-4 font-medium"
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive font-medium px-4 py-3 bg-destructive/10 rounded-xl border border-destructive/20">{error}</p>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/25 disabled:opacity-70"
                    disabled={loading || !name.trim()}
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Initializing...</>
                    ) : (
                      <><CheckCircle2 className="mr-2 h-4 w-4" /> Create Project</>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppShell>
  )
}
