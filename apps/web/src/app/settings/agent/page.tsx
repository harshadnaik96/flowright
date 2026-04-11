import { AppShell } from "@/components/layout/AppShell"
import { AgentSettings } from "./AgentSettings"
import { api } from "@/lib/api"

async function getTokens() {
  try {
    return await api.agentTokens.list()
  } catch {
    return []
  }
}

export default async function AgentSettingsPage() {
  const tokens = await getTokens()

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each tester runs a local Flowright agent that connects to this portal
            and executes Maestro tests close to their Android device.
          </p>
        </div>
        <AgentSettings initialTokens={tokens} />
      </div>
    </AppShell>
  )
}
