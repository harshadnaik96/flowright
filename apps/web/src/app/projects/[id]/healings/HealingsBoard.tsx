"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-[2px] transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted-foreground/70">({t.count})</span>
          </button>
        ))}
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
  <Card>
    <CardContent className="py-12 text-center text-sm text-muted-foreground">
      {tab === "pending"
        ? "No pending healings. When a run fails on a selector and the AI proposes a fix, it'll appear here."
        : tab === "accepted"
        ? "No accepted healings yet."
        : "No rejected healings yet."}
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
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="secondary" className="text-[10px]">
              Step {healing.stepOrder}
            </Badge>
            <span className="text-sm text-muted-foreground truncate">
              {healing.flowName}
            </span>
          </div>
          <StatusPill status={healing.status} />
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-1">
              Step
            </p>
            <p className="text-sm">{healing.stepPlainEnglish}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <CommandBlock label="Original" command={healing.originalCommand} variant="failed" />
            <CommandBlock label="Healed"   command={healing.healedCommand}  variant="healed" />
          </div>

          {(healing.originalSelector || healing.healedSelector) && (
            <div className="grid md:grid-cols-2 gap-3 text-xs font-mono">
              <SelectorPair label="Original selector" value={healing.originalSelector} />
              <SelectorPair label="Healed selector"   value={healing.healedSelector} />
            </div>
          )}

          {healing.errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <span className="font-semibold">Failure:</span> {healing.errorMessage}
            </div>
          )}

          {healing.screenshotPath && (
            <a
              href={api.runner.screenshotUrl(healing.screenshotPath)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              View post-heal screenshot
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Actions */}
        {reviewable && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/20">
            {error && <span className="text-xs text-destructive mr-auto">{error}</span>}
            <Button
              size="sm"
              variant="outline"
              onClick={onReject}
              disabled={isPending}
              aria-label="Reject healing"
            >
              <X className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={onAccept}
              disabled={isPending}
              aria-label="Accept healing and apply to flow"
            >
              <Check className="h-4 w-4 mr-1.5" />
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

const SelectorPair = ({ label, value }: { label: string; value?: string }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-0.5">{label}</p>
    <p className="text-muted-foreground break-all">{value || "—"}</p>
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
