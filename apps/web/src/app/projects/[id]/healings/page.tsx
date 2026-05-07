import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, XCircle, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { HealingsBoard } from "./HealingsBoard";

export const dynamic = "force-dynamic";

export default async function HealingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  let project;
  try {
    project = await api.projects.get(projectId);
  } catch {
    notFound();
  }

  const [pending, accepted, rejected] = await Promise.all([
    api.healings.list({ projectId, status: "pending" }),
    api.healings.list({ projectId, status: "accepted" }),
    api.healings.list({ projectId, status: "rejected" }),
  ]);

  const stats = [
    { label: "Pending review", value: pending.length, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20" },
    { label: "Accepted", value: accepted.length, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10 border-green-500/20" },
    { label: "Rejected", value: rejected.length, icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-10 text-white shadow-2xl shadow-indigo-500/10">
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <Link href={`/projects/${projectId}`}>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-indigo-400 font-bold text-xs uppercase tracking-widest">
                {project.name} · Self-heal review
              </p>
            </div>
            <div className="flex items-end justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-6 w-6 text-yellow-400" />
                  <h1 className="text-3xl font-black tracking-tight">AI Heal Review</h1>
                </div>
                <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
                  When a step fails on a selector, the runner snapshots the live DOM and asks Gemini for a fix.
                  Proposals that recovered the step land here. Accept to permanently update the flow command; reject to discard.
                </p>
              </div>
            </div>

            {/* Stat chips */}
            <div className="flex items-center gap-3 pt-2">
              {stats.map((s) => (
                <div key={s.label} className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                  <span className="text-white font-bold text-lg tabular-nums">{s.value}</span>
                  <span className="text-slate-400 text-xs">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -right-20 -top-20 h-64 w-64 bg-indigo-500/10 blur-[80px]" />
          <div className="absolute -left-20 -bottom-20 h-64 w-64 bg-yellow-500/5 blur-[80px]" />
        </section>

        <HealingsBoard
          projectId={projectId}
          pending={pending}
          accepted={accepted}
          rejected={rejected}
        />
      </div>
    </AppShell>
  );
}
