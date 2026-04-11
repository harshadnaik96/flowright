import { notFound } from "next/navigation"
import { api } from "@/lib/api"
import { NewEnvironmentForm } from "./NewEnvironmentForm"

export default async function NewEnvironmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  let project
  try {
    project = await api.projects.get(projectId)
  } catch {
    notFound()
  }

  return <NewEnvironmentForm projectId={projectId} platform={project.platform} />
}
