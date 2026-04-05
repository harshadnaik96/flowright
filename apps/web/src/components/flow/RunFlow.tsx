"use client";

import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, XCircle, Loader2, Circle, AlertTriangle,
  Play, Pencil, Check, X, ChevronDown, ChevronRight,
  Terminal, Clock, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { FlowVariable, WsEvent } from "@flowright/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepLiveState = {
  id: string;
  order: number;
  plainEnglish: string;
  cypressCommand: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  screenshotPath?: string;
  errorMessage?: string;
  warningMessage?: string;
  durationMs?: number;
  startedAt?: number;
};

type RunFlowProps = {
  flowId: string;
  flowName: string;
  variables: FlowVariable[];
  totalSteps: number;
  environments: Array<{ id: string; name: string; baseUrl: string }>;
  stepSummaries: Array<{ id: string; order: number; plainEnglish: string; cypressCommand: string }>;
};

type PageState = "setup" | "starting" | "running" | "done";

// ─── Status icon ──────────────────────────────────────────────────────────────

function StepStatusIcon({ status }: { status: StepLiveState["status"] }) {
  if (status === "passed")  return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "failed")  return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (status === "running") return <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />;
  if (status === "skipped") return <SkipForward className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
  return <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />;
}

// ─── Live elapsed ticker ──────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [startedAt]);

  const s = (elapsed / 1000).toFixed(1);
  return (
    <span className="flex items-center gap-1 text-xs text-primary font-mono tabular-nums">
      <Clock className="h-3 w-3" /> {s}s
    </span>
  );
}

// ─── Animated terminal log (running state) ────────────────────────────────────

const LOG_MESSAGES = [
  "Evaluating selector…",
  "Waiting for element…",
  "Executing action…",
  "Checking assertions…",
];

function LiveTerminal({ command }: { command: string }) {
  const [lineIdx, setLineIdx] = useState(0);
  const [dots, setDots]       = useState("");

  useEffect(() => {
    const dotTimer = setInterval(
      () => setDots((d) => (d.length >= 3 ? "" : d + ".")),
      400
    );
    const lineTimer = setInterval(
      () => setLineIdx((i) => (i + 1) % LOG_MESSAGES.length),
      1800
    );
    return () => { clearInterval(dotTimer); clearInterval(lineTimer); };
  }, []);

  return (
    <div className="mt-3 rounded-md border border-border/50 bg-black/80 overflow-hidden text-xs font-mono">
      {/* Terminal header bar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/10 bg-white/5">
        <Terminal className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-muted-foreground/60 text-[10px] tracking-wide uppercase">runner</span>
      </div>

      <div className="p-3 space-y-1.5">
        {/* The cypress command being executed */}
        <div className="flex gap-2">
          <span className="text-emerald-400 shrink-0">$</span>
          <code className="text-emerald-300/90 break-all whitespace-pre-wrap leading-relaxed">
            {command}
          </code>
        </div>

        {/* Animated status line */}
        <div className="flex items-center gap-2 text-sky-400/80 pl-4">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
          <span>{LOG_MESSAGES[lineIdx]}{dots}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Accordion step row ───────────────────────────────────────────────────────

function AccordionStepRow({
  step,
  isOpen,
  onToggle,
  showActions,
  flowId,
  onCommandSaved,
}: {
  step: StepLiveState;
  isOpen: boolean;
  onToggle: () => void;
  showActions: boolean;
  flowId: string;
  onCommandSaved: (stepId: string, newCommand: string) => void;
}) {
  const [imgExpanded, setImgExpanded]   = useState(false);
  const [editing, setEditing]           = useState(false);
  const [draftCommand, setDraftCommand] = useState(step.cypressCommand);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);

  // Sync draft if command is patched externally
  useEffect(() => { setDraftCommand(step.cypressCommand); }, [step.cypressCommand]);

  const handleSave = async () => {
    if (!draftCommand.trim() || draftCommand === step.cypressCommand) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.flows.updateStep(flowId, step.id, { cypressCommand: draftCommand.trim() });
      onCommandSaved(step.id, draftCommand.trim());
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<StepLiveState["status"], string> = {
    pending: "border-border/50 bg-transparent",
    running: "border-primary/40 bg-primary/5",
    passed:  "border-green-500/25 bg-green-500/5",
    failed:  "border-destructive/40 bg-destructive/5",
    skipped: "border-border/30 bg-muted/20",
  };

  const hasBody =
    step.status === "running" ||
    step.status === "passed"  ||
    step.status === "failed";

  return (
    <div
      className={`rounded-lg border transition-colors duration-200 ${statusColors[step.status]}`}
    >
      {/* ── Header row (always visible) ────────────────────────────────── */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasBody}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left group disabled:cursor-default"
        aria-expanded={isOpen}
      >
        {/* Step number badge */}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
          {step.order}
        </span>

        {/* Status icon */}
        <StepStatusIcon status={step.status} />

        {/* Plain english label */}
        <span className={`flex-1 text-sm leading-snug ${
          step.status === "skipped" ? "text-muted-foreground/50 line-through" : ""
        }`}>
          {step.plainEnglish}
        </span>

        {/* Right side decorators */}
        <div className="flex items-center gap-2 shrink-0">
          {step.status === "running" && step.startedAt && (
            <ElapsedTimer startedAt={step.startedAt} />
          )}

          {step.status === "passed" && step.durationMs !== undefined && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground/60 font-mono tabular-nums">
              <Clock className="h-3 w-3" />
              {(step.durationMs / 1000).toFixed(2)}s
            </span>
          )}

          {hasBody && (
            isOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform" />
          )}
        </div>
      </button>

      {/* ── Expandable body ─────────────────────────────────────────────── */}
      {isOpen && hasBody && (
        <div className="px-3 pb-3 space-y-2 border-t border-inherit pt-2">

          {/* Running → animated terminal */}
          {step.status === "running" && (
            <LiveTerminal command={step.cypressCommand} />
          )}

          {/* Passed → show the command that ran */}
          {step.status === "passed" && (
            <div className="rounded-md border border-border/50 bg-black/70 overflow-hidden text-xs font-mono">
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/10 bg-white/5">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span className="text-muted-foreground/60 text-[10px] tracking-wide uppercase">passed</span>
              </div>
              <div className="p-3 flex gap-2">
                <span className="text-green-400 shrink-0">$</span>
                <code className="text-green-300/80 break-all whitespace-pre-wrap leading-relaxed">
                  {step.cypressCommand}
                </code>
              </div>
            </div>
          )}

          {/* Warning message */}
          {step.warningMessage && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2.5 py-1.5 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              {step.warningMessage}
            </p>
          )}

          {/* Failed → error + command editor */}
          {step.status === "failed" && (
            <>
              {/* Terminal block for failed command */}
              <div className="rounded-md border border-destructive/30 bg-black/70 overflow-hidden text-xs font-mono">
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/10 bg-white/5">
                  <XCircle className="h-3 w-3 text-destructive" />
                  <span className="text-muted-foreground/60 text-[10px] tracking-wide uppercase">failed</span>
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-red-400 shrink-0">$</span>
                    <code className="text-red-300/80 break-all whitespace-pre-wrap leading-relaxed">
                      {step.cypressCommand}
                    </code>
                  </div>
                  {step.errorMessage && (
                    <div className="flex gap-2 text-red-400/70 pl-4">
                      <span className="shrink-0">✗</span>
                      <span className="whitespace-pre-wrap">{step.errorMessage}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Inline command fixer */}
              {showActions && (
                <div className="space-y-1.5">
                  {editing ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium">Fix Cypress command</p>
                      <div className="flex gap-2">
                        <Input
                          className="font-mono text-xs h-8"
                          value={draftCommand}
                          onChange={(e) => setDraftCommand(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            if (e.key === "Escape") { setEditing(false); setDraftCommand(step.cypressCommand ?? ""); }
                          }}
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSave} disabled={saving} aria-label="Save">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { setEditing(false); setDraftCommand(step.cypressCommand ?? ""); }} aria-label="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 text-xs text-primary underline underline-offset-2"
                    >
                      <Pencil className="h-3 w-3" /> Fix command
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Screenshot */}
          {showActions && step.screenshotPath && (
            <div>
              <button
                onClick={() => setImgExpanded((v) => !v)}
                className="text-xs text-primary underline underline-offset-2"
              >
                {imgExpanded ? "Hide screenshot" : "View screenshot"}
              </button>
              {imgExpanded && (
                <img
                  src={api.runner.screenshotUrl(step.screenshotPath)}
                  alt={`Step ${step.order} screenshot`}
                  className="mt-2 rounded border w-full max-w-md"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RunFlow({
  flowId,
  flowName,
  variables,
  totalSteps,
  environments,
  stepSummaries,
}: RunFlowProps) {
  const [pageState, setPageState] = useState<PageState>("setup");
  const [envId, setEnvId]         = useState(environments[0]?.id ?? "");
  const [varValues, setVarValues] = useState<Record<string, string>>(
    Object.fromEntries(variables.map((v) => [v.key, v.defaultValue ?? ""]))
  );

  // Persist command edits across resets
  const savedEdits = useRef<Record<string, string>>({});

  const buildSteps = (): StepLiveState[] =>
    stepSummaries.map((s) => ({
      ...s,
      cypressCommand: savedEdits.current[s.id] ?? s.cypressCommand,
      status: "pending" as const,
    }));

  const [steps, setSteps] = useState<StepLiveState[]>(buildSteps);

  // Accordion open state — key: step.order
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());

  const toggleStep = (order: number) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order); else next.add(order);
      return next;
    });

  const handleCommandSaved = (stepId: string, newCommand: string) => {
    savedEdits.current[stepId] = newCommand;
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, cypressCommand: newCommand } : s))
    );
  };

  const [overallStatus, setOverallStatus] = useState<"passed" | "failed" | "error" | null>(null);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const wsRef                             = useRef<WebSocket | null>(null);
  const runIdRef                          = useRef<string | null>(null);

  useEffect(() => { return () => { wsRef.current?.close(); }; }, []);

  const connectWs = (runId: string) => {
    const ws = new WebSocket(api.runner.wsUrl(runId));
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const event = JSON.parse(ev.data) as WsEvent;

      if (event.type === "run:started") {
        setPageState("running");
      }

      if (event.type === "step:started") {
        const order = event.payload.stepOrder!;
        setSteps((prev) =>
          prev.map((s) =>
            s.order === order ? { ...s, status: "running", startedAt: Date.now() } : s
          )
        );
        // Auto-expand the running step, collapse previous
        setOpenSteps(new Set([order]));
      }

      if (event.type === "step:passed" || event.type === "step:failed") {
        const order = event.payload.stepOrder!;
        setSteps((prev) =>
          prev.map((s) => {
            if (s.order !== order) return s;
            const durationMs = s.startedAt ? Date.now() - s.startedAt : undefined;
            return {
              ...s,
              status: event.type === "step:passed" ? "passed" : "failed",
              screenshotPath: event.payload.screenshotPath,
              errorMessage:   event.payload.errorMessage,
              warningMessage: event.payload.warningMessage,
              durationMs,
            };
          })
        );
        // Keep it open after completion (shows result)
        setOpenSteps((prev) => new Set([...prev, order]));
      }

      if (event.type === "run:completed") {
        setOverallStatus(event.payload.status as "passed" | "failed");
        setSteps((prev) =>
          prev.map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s))
        );
        setPageState("done");
        ws.close();
      }

      if (event.type === "run:error") {
        setOverallStatus("error");
        setErrorMsg(event.payload.errorMessage ?? "An unexpected error occurred");
        setPageState("done");
        ws.close();
      }
    };

    ws.onerror = () => {
      setOverallStatus("error");
      setErrorMsg("WebSocket connection failed");
      setPageState("done");
    };
  };

  const handleRun = async () => {
    if (!envId) return;
    setPageState("starting");
    setSteps(buildSteps());
    setOpenSteps(new Set());
    setOverallStatus(null);
    setErrorMsg(null);

    try {
      const { runId } = await api.runner.start({
        flowId,
        environmentId: envId,
        runtimeVariables: varValues,
      });
      runIdRef.current = runId;
      connectWs(runId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start run");
      setPageState("setup");
    }
  };

  const handleRunAgain = () => {
    wsRef.current?.close();
    setPageState("setup");
    setSteps(buildSteps());
    setOpenSteps(new Set());
    setOverallStatus(null);
    setErrorMsg(null);
  };

  // ── Setup form ───────────────────────────────────────────────────────────

  if (pageState === "setup" || pageState === "starting") {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium mb-3">Environment</p>
          <div className="flex flex-col gap-2">
            {environments.map((env) => (
              <label key={env.id} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="environment"
                  value={env.id}
                  checked={envId === env.id}
                  onChange={() => setEnvId(env.id)}
                  className="accent-primary"
                />
                <span className="text-sm font-medium">{env.name}</span>
                <span className="text-xs text-muted-foreground">{env.baseUrl}</span>
              </label>
            ))}
          </div>
        </div>

        {variables.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <p className="text-sm font-medium">Variables</p>
              {variables.map((v) => (
                <div key={v.key} className="space-y-1.5">
                  <Label htmlFor={`var-${v.key}`} className="font-mono text-xs text-primary">
                    {v.key}
                  </Label>
                  {v.description && (
                    <p className="text-xs text-muted-foreground">{v.description}</p>
                  )}
                  <Input
                    id={`var-${v.key}`}
                    value={varValues[v.key] ?? ""}
                    onChange={(e) =>
                      setVarValues((prev) => ({ ...prev, [v.key]: e.target.value }))
                    }
                    placeholder={`Enter ${v.key}`}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {errorMsg && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </p>
        )}

        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{totalSteps} steps will run</p>
          <Button onClick={handleRun} disabled={pageState === "starting" || !envId}>
            {pageState === "starting" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
            ) : (
              <><Play className="h-4 w-4" /> Run Flow</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Live / Results ───────────────────────────────────────────────────────

  const isDone = pageState === "done";

  return (
    <div className="space-y-4">
      {/* Overall result banner */}
      {isDone && overallStatus && (
        <Card className={overallStatus === "passed"
          ? "border-green-500/30 bg-green-500/5"
          : "border-destructive/30 bg-destructive/5"
        }>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {overallStatus === "passed" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-medium text-sm">
                {overallStatus === "passed" ? "All steps passed" :
                 overallStatus === "failed" ? "Run failed" : "Run error"}
              </span>
              {errorMsg && <span className="text-xs text-muted-foreground ml-2">{errorMsg}</span>}
            </div>
            <Button variant="outline" size="sm" onClick={handleRunAgain}>
              Run Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Running header */}
      {!isDone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Running {flowName}…
        </div>
      )}

      {/* ── Accordion step list ───────────────────────────────────────── */}
      <div className="space-y-1.5">
        {steps.map((step) => (
          <AccordionStepRow
            key={step.order}
            step={step}
            isOpen={openSteps.has(step.order)}
            onToggle={() => toggleStep(step.order)}
            showActions={isDone}
            flowId={flowId}
            onCommandSaved={handleCommandSaved}
          />
        ))}
      </div>
    </div>
  );
}
