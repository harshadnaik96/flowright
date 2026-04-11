import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { BulkEditorShell } from "@/components/flow/BulkEditor/BulkEditorShell";

export default async function BulkEditPage({
  params,
}: {
  params: Promise<{ id: string; flowId: string }>;
}) {
  const { id: projectId, flowId } = await params;

  let flow, project;
  try {
    [flow, project] = await Promise.all([
      api.flows.get(flowId),
      api.projects.get(projectId),
    ]);
  } catch {
    notFound();
  }

  if (!flow?.steps?.length) notFound();

  return (
    <BulkEditorShell
      flowId={flowId}
      projectId={projectId}
      flowName={flow.name}
      steps={flow.steps}
      platform={project.platform}
    />
  );
}
