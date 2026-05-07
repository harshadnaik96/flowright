import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
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

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {project.name} · Self-heal review
          </p>
          <h1 className="text-2xl font-semibold">Pending healings</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            When a step fails because a selector no longer matches, the runner
            re-extracts the live DOM and asks Gemini for a replacement. Healed
            selectors that recovered the step land here for review. Accepting
            applies the new command to the flow; rejecting discards it.
          </p>
        </header>

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
