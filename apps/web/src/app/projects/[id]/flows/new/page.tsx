"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/layout/AppShell"
import { WritePanel } from "@/components/flow/WritePanel"
import { RefinePanel } from "@/components/flow/RefinePanel"
import { StepsPanel } from "@/components/flow/StepsPanel"
import { api } from "@/lib/api"
import type { Environment, FlowVariable } from "@flowright/shared"
import type { Step } from "@/components/flow/StepRow"

type Panel = "write" | "refine" | "steps"

export default function NewFlowPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = use(params)
  const router = useRouter()

  const [environments, setEnvironments] = useState<Environment[]>([])

  // Form state
  const [panel, setPanel] = useState<Panel>("write")
  const [flowName, setFlowName] = useState("")
  const [environmentId, setEnvironmentId] = useState("")
  const [rawInput, setRawInput] = useState("")
  const [refinedText, setRefinedText] = useState("")
  const [steps, setSteps] = useState<Step[]>([])
  const [variables, setVariables] = useState<FlowVariable[]>([])
  const [flowId, setFlowId] = useState<string | null>(null)

  // Loading / error state
  const [isRefining, setIsRefining] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isRegeneratingIndex, setIsRegeneratingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.environments.list(projectId).then(setEnvironments).catch(() => {})
  }, [projectId])

  // ── Step 1: Refine ────────────────────────────────────────────────────────
  async function handleRefine() {
    setIsRefining(true)
    setError(null)
    try {
      const { refined } = await api.generator.refine(rawInput)
      setRefinedText(refined)
      setPanel("refine")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed")
    } finally {
      setIsRefining(false)
    }
  }

  // ── Step 2: Generate steps ────────────────────────────────────────────────
  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const result = await api.generator.generate({
        refinedTestCase: refinedText,
        rawTestCase: rawInput,
        environmentId,
        flowName,
        projectId,
      })
      setSteps(result.steps)
      setVariables(result.detectedVariables)
      setFlowId(result.flowId)
      setPanel("steps")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Regenerate a single step ──────────────────────────────────────────────
  async function handleRegenerate(index: number, instruction: string) {
    if (!flowId) return
    setIsRegeneratingIndex(index)
    try {
      const { step } = await api.generator.regenerateStep(flowId, {
        stepIndex: index,
        instruction,
        currentSteps: steps,
        environmentId,
      })
      setSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...step } : s))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Step regeneration failed")
    } finally {
      setIsRegeneratingIndex(null)
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!flowId) return
    setIsApproving(true)
    setError(null)
    try {
      await api.generator.approve(flowId, { steps, variables })
      router.push(`/projects/${projectId}/flows/${flowId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed")
    } finally {
      setIsApproving(false)
    }
  }

  function handleVariableChange(key: string, value: string) {
    setVariables((prev) =>
      prev.map((v) => (v.key === key ? { ...v, defaultValue: value } : v))
    )
  }

  const panelLabels: Record<Panel, string> = {
    write: "Write",
    refine: "Refine",
    steps: "Review",
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(["write", "refine", "steps"] as Panel[]).map((p, i) => (
            <div key={p} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium border transition-colors ${
                  p === panel
                    ? "bg-primary text-primary-foreground border-primary"
                    : i < ["write", "refine", "steps"].indexOf(panel)
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm ${
                  p === panel ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {panelLabels[p]}
              </span>
              {i < 2 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* Panels */}
        {panel === "write" && (
          <WritePanel
            flowName={flowName}
            rawInput={rawInput}
            environmentId={environmentId}
            environments={environments}
            isRefining={isRefining}
            error={error}
            onFlowNameChange={setFlowName}
            onRawInputChange={setRawInput}
            onEnvironmentChange={setEnvironmentId}
            onRefine={handleRefine}
          />
        )}

        {panel === "refine" && (
          <RefinePanel
            refinedText={refinedText}
            isGenerating={isGenerating}
            error={error}
            onRefinedTextChange={setRefinedText}
            onBack={() => setPanel("write")}
            onGenerate={handleGenerate}
          />
        )}

        {panel === "steps" && flowId && (
          <StepsPanel
            steps={steps}
            variables={variables}
            isApproving={isApproving}
            isRegeneratingIndex={isRegeneratingIndex}
            error={error}
            onVariableChange={handleVariableChange}
            onRegenerate={handleRegenerate}
            onBack={() => setPanel("refine")}
            onApprove={handleApprove}
          />
        )}
      </div>
    </AppShell>
  )
}
