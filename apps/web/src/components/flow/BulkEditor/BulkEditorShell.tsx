"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { FlowStep } from "@flowright/shared";
import { buildEditorDocument, parseEditorDocument } from "./editorUtils";
import { StepsToc } from "./StepsToc";
import { MonacoEditorPane, type MonacoEditorHandle } from "./MonacoEditorPane";

type Props = {
  flowId: string;
  projectId: string;
  flowName: string;
  steps: FlowStep[];
};

export const BulkEditorShell = ({ flowId, projectId, flowName, steps }: Props) => {
  const router = useRouter();
  const editorPaneRef = useRef<MonacoEditorHandle | null>(null);

  const [editorContent, setEditorContent] = useState(() => buildEditorDocument(steps));
  const [activeOrder, setActiveOrder] = useState<number | null>(steps[0]?.order ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

  // Warn user before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleStepClick = useCallback((order: number) => {
    setActiveOrder(order);
    editorPaneRef.current?.scrollToStep(order);
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value);
    setIsDirty(true);
    setSaveErrors([]);
  }, []);

  const handleCursorStepChange = useCallback((order: number) => {
    setActiveOrder(order);
  }, []);

  async function handleSave() {
    setSaveErrors([]);
    const { parsed, errors } = parseEditorDocument(editorContent, steps);

    if (errors.length > 0) {
      setSaveErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      await api.flows.bulkUpdateSteps(flowId, { steps: parsed });
      setIsDirty(false);
      router.push(`/projects/${projectId}/flows/${flowId}`);
      router.refresh();
    } catch (err) {
      setSaveErrors([err instanceof Error ? err.message : "Save failed"]);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Slim header - Softened with subtle shadow and blur */}
      <header className="shrink-0 sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
        <div className="h-14 px-6 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-primary mr-4 hover:opacity-80 transition-opacity">
            <div className="bg-primary/10 p-1.5 rounded-xl">
              <FlaskConical className="h-4.5 w-4.5" />
            </div>
            <span className="tracking-tight">Flowright</span>
          </Link>
          <div className="h-6 w-px bg-border/60" />
          <Link
            href={`/projects/${projectId}/flows/${flowId}`}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-all px-2 py-1 rounded-lg hover:bg-secondary/80"
            onClick={(e) => {
              if (isDirty && !confirm("You have unsaved changes. Leave anyway?")) {
                e.preventDefault();
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-center text-foreground/80">{flowName}</p>
          </div>
          {isDirty && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-600 uppercase tracking-wider shrink-0 animate-pulse">
              <div className="h-1 w-1 rounded-full bg-amber-600" />
              Unsaved
            </div>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !isDirty}
            className={cn(
              "shrink-0 font-semibold gap-2 px-4 shadow-sm transition-all",
              isDirty ? "shadow-primary/20 hover:shadow-primary/30" : ""
            )}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {saveErrors.length > 0 && (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-6 py-3 animate-in slide-in-from-top duration-300">
          <p className="text-xs font-bold text-destructive mb-1.5 flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-destructive" />
            Please resolve the following:
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5">
            {saveErrors.map((err, i) => (
              <li key={i} className="text-xs text-destructive/80 flex items-start gap-1.5">
                <span className="opacity-50">•</span> {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Body */}
      <div className={cn("flex flex-1 min-h-0 bg-background/50")}>
        {/* Steps TOC - Using a more custom, minimalist approach */}
        <aside className="w-80 shrink-0 border-r border-border/30 overflow-y-auto bg-transparent">
          <div className="px-7 pt-8 pb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50 px-1">
              Steps
            </p>
          </div>
          <StepsToc
            steps={steps}
            activeOrder={activeOrder}
            onStepClick={handleStepClick}
          />
        </aside>

        {/* Monaco editor */}
        <main className="flex-1 flex flex-col min-w-0 bg-card">
          <div className="flex-1 relative overflow-hidden">
            <MonacoEditorPane
              ref={editorPaneRef}
              initialContent={editorContent}
              onChange={handleEditorChange}
              onCursorStepChange={handleCursorStepChange}
            />
          </div>
        </main>
      </div>
    </div>
  );
};
