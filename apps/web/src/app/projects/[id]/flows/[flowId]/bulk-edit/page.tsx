import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { BulkEditorShell } from "@/components/flow/BulkEditor/BulkEditorShell";

export default async function BulkEditPage({
  params,
}: {
  params: Promise<{ id: string; flowId: string }>;
}) {
  const { id: projectId, flowId } = await params;

  let flow;
  try {
    flow = await api.flows.get(flowId);
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
    />
  );
}
