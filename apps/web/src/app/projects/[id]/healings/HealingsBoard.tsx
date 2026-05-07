"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Image as ImageIcon, ExternalLink, Clock, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { SelectorHealing } from "@flowright/shared";

type HealingRow = SelectorHealing & {
  stepPlainEnglish: string;
  stepOrder: number;
  flowName: string;
  projectId: string;
};

type Props = {
  projectId: string;
  pending: HealingRow[];
  accepted: HealingRow[];
  rejected: HealingRow[];
};

const TAB_CONFIG = {
  pending:  { icon: Clock,         color: "text-yellow-500", activeClass: "border-yellow-500 text-yellow-600 dark:text-yellow-400" },
  accepted: { icon: CheckCircle2,  color: "text-green-500",  activeClass: "border-green-500 text-green-600 dark:text-green-400" },
  rejected: { icon: XCircle,       color: "text-muted-foreground", activeClass: "border-muted-foreground text-foreground" },
} as const;

export const HealingsBoard = ({ pending, accepted, rejected }: Props) => {
  const [tab, setTab] = useState<"pending" | "accepted" | "rejected">("pending");
  const rows = tab === "pending" ? pending : tab === "accepted" ? accepted : rejected;

  const tabs: Array<{ key: typeof tab; label: string; count: number }> = [
    { key: "pending",  label: "Pending",  count: pending.length  },
    { key: "accepted", label: "Accepted", count: accepted.length },
    { key: "rejected", label: "Rejected", count: rejected.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((t) => {
          const cfg = TAB_CONFIG[t.key];
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-[2px] transition-colors ${
                isActive
                  ? cfg.activeClass
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <cfg.icon className={`h-3.5 w-3.5 ${isActive ? cfg.color : ""}`} />
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
                isActive && t.key === "pending" && t.count > 0
                  ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                  : "bg-muted text-muted-foreground"
              }`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {rows.map((h) => (
            <HealingCard key={h.id} healing={h} reviewable={tab === "pending"} />
          ))}
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ tab }: { tab: "pending" | "accepted" | "rejected" }) => (
  <Card className="border-dashed border-2">
    <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
      {tab === "pending" ? (
        <>
          <div className="rounded-full bg-yellow-500/10 p-4">
            <Sparkles className="h-6 w-6 text-yellow-500" />
          </div>
          <p className="font-medium text-sm">No pending healings</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            When a run fails on a selector and Gemini proposes a fix that recovers the step, it will appear here for your review.
          </p>
        </>
      ) : tab === "accepted" ? (
        <>
          <div className="rounded-full bg-green-500/10 p-4">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
          <p className="font-medium text-sm">No accepted healings yet</p>
          <p className="text-xs text-muted-foreground">Accepted proposals are applied permanently to the flow steps.</p>
        </>
      ) : (
        <>
          <div className="rounded-full bg-muted p-4">
            <XCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-sm">No rejected healings yet</p>
          <p className="text-xs text-muted-foreground">Discarded proposals appear here for reference.</p>
        </>
      )}
    </CardContent>
  </Card>
);

const HealingCard = ({
  healing,
  reviewable,
}: {
  healing: HealingRow;
  reviewable: boolean;
}) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onAccept = () => {
    setError(null);
    startTransition(async () => {
      try {
        await api.healings.accept(healing.id, true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Accept failed");
      }
    });
  };

  const onReject = () => {
    setError(null);
    startTransition(async () => {
      try {
        await api.healings.reject(healing.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reject failed");
      }
    });
  };

  return (
    <Card className="overflow-hidden border-border/60 hover:border-border transition-colors">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
              {healing.stepOrder}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">{healing.flowName}</p>
              <p className="text-sm font-medium truncate">{healing.stepPlainEnglish}</p>
            </div>
          </div>
          <StatusPill status={healing.status} />
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Command diff */}
          <div className="grid md:grid-cols-2 gap-3">
            <CommandBlock label="Original command" command={healing.originalCommand} variant="failed" />
            <CommandBlock label="AI-healed command" command={healing.healedCommand} variant="healed" />
          </div>

          {/* Selector diff */}
          {(healing.originalSelector || healing.healedSelector) && (
            <div className="grid md:grid-cols-2 gap-3">
              <SelectorPair label="Original selector" value={healing.originalSelector} />
              <SelectorPair label="Healed selector" value={healing.healedSelector} />
            </div>
          )}

          {/* Failure reason */}
          {healing.errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{healing.errorMessage}</span>
            </div>
          )}

          {/* Screenshot link */}
          {healing.screenshotPath && (
            <a
              href={api.runner.screenshotUrl(healing.screenshotPath)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              View post-heal screenshot
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Actions */}
        {reviewable && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
            {error && <span className="text-xs text-destructive mr-auto">{error}</span>}
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
              aria-label="Reject healing"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-500/20"
              aria-label="Accept healing and apply to flow"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Accept &amp; apply
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const CommandBlock = ({
  label,
  command,
  variant,
}: {
  label: string;
  command: string;
  variant: "failed" | "healed";
}) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">{label}</p>
    <pre
      className={`text-xs font-mono whitespace-pre-wrap break-all rounded-md border px-3 py-2 ${
        variant === "failed"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400"
      }`}
    >
      {command}
    </pre>
  </div>
);

const SelectorPair = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1 font-semibold">{label}</p>
    <p className="text-xs font-mono text-muted-foreground break-all bg-muted/50 rounded px-2 py-1.5 border border-border/50">
      {value || "—"}
    </p>
  </div>
);

const StatusPill = ({ status }: { status: SelectorHealing["status"] }) => {
  const styles =
    status === "pending"  ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" :
    status === "accepted" ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" :
                            "bg-muted text-muted-foreground border-border";
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${styles}`}>
      {status}
    </span>
  );
};
