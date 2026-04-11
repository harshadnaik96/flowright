import type {
  Project,
  Environment,
  Flow,
  FlowStep,
  FlowVariable,
  SelectorRegistry,
  TestRun,
  StepResult,
  CreateProjectRequest,
  CreateEnvironmentRequest,
  CrawlResponse,
  BulkUpdateStepsRequest,
  BulkUpdateStepsResponse,
} from "@flowright/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const hasBody = !!options?.body
  const res = await fetch(`${BASE}${path}`, {
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export const api = {
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (body: CreateProjectRequest) =>
      request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<CreateProjectRequest>) =>
      request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<void>(`/projects/${id}`, { method: "DELETE" }),
  },

  // ─── Environments ───────────────────────────────────────────────────────────

  environments: {
    list: (projectId: string) =>
      request<Environment[]>(`/projects/${projectId}/environments`),
    get: (projectId: string, id: string) =>
      request<Environment & { registry: { id: string; crawledAt: string } | null }>(
        `/projects/${projectId}/environments/${id}`
      ),
    create: (projectId: string, body: CreateEnvironmentRequest) =>
      request<Environment>(`/projects/${projectId}/environments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (projectId: string, id: string, body: Partial<CreateEnvironmentRequest>) =>
      request<Environment>(`/projects/${projectId}/environments/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    delete: (projectId: string, id: string) =>
      request<void>(`/projects/${projectId}/environments/${id}`, { method: "DELETE" }),
  },

  // ─── Crawler ────────────────────────────────────────────────────────────────

  crawler: {
    crawl: (environmentId: string) =>
      request<CrawlResponse>("/crawler/crawl", {
        method: "POST",
        body: JSON.stringify({ environmentId }),
      }),
    registry: (environmentId: string) =>
      request<SelectorRegistry>(`/crawler/registry/${environmentId}`),
  },

  // ─── Generator ──────────────────────────────────────────────────────────────

  generator: {
    refine: (rawInput: string) =>
      request<{ refined: string }>("/generator/refine", {
        method: "POST",
        body: JSON.stringify({ rawInput }),
      }),
    generate: (body: {
      refinedTestCase: string;
      rawTestCase: string;
      environmentId: string;
      flowName: string;
      projectId: string;
    }) =>
      request<{
        flowId: string;
        steps: Array<{
          order: number;
          plainEnglish: string;
          command: string;
          selectorUsed: string | null;
        }>;
        detectedVariables: FlowVariable[];
      }>("/generator/generate", { method: "POST", body: JSON.stringify(body) }),
    regenerateStep: (
      flowId: string,
      body: {
        stepIndex: number;
        instruction: string;
        currentSteps: Array<{
          order: number;
          plainEnglish: string;
          command: string;
          selectorUsed: string | null;
        }>;
        environmentId: string;
      }
    ) =>
      request<{
        step: {
          order: number;
          plainEnglish: string;
          command: string;
          selectorUsed: string | null;
        };
      }>(`/generator/regenerate-step/${flowId}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    regenerateFlow: (
      flowId: string,
      body: {
        refinedTestCase: string;
        rawTestCase: string;
        environmentId: string;
        flowName: string;
      }
    ) =>
      request<{
        flowId: string;
        steps: Array<{
          order: number;
          plainEnglish: string;
          command: string;
          selectorUsed: string | null;
        }>;
        detectedVariables: FlowVariable[];
      }>(`/generator/regenerate-flow/${flowId}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    approve: (
      flowId: string,
      body: {
        steps: Array<{
          order: number;
          plainEnglish: string;
          command: string;
          selectorUsed?: string | null;
        }>;
        variables: FlowVariable[];
      }
    ) =>
      request<{ flowId: string; status: string }>(
        `/generator/approve/${flowId}`,
        { method: "POST", body: JSON.stringify(body) }
      ),
  },

  // ─── Flows ──────────────────────────────────────────────────────────────────

  flows: {
    list: (projectId: string) =>
      request<Flow[]>(`/flows?projectId=${projectId}`),
    get: (flowId: string) =>
      request<Flow & { steps: FlowStep[] }>(`/flows/${flowId}`),
    delete: (flowId: string) =>
      request<void>(`/flows/${flowId}`, { method: "DELETE" }),
    updateStep: (
      flowId: string,
      stepId: string,
      body: { command: string; selectorUsed?: string | null }
    ) =>
      request<{ step: FlowStep }>(`/flows/${flowId}/steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    bulkUpdateSteps: (flowId: string, body: BulkUpdateStepsRequest) =>
      request<BulkUpdateStepsResponse>(`/flows/${flowId}/steps`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // ─── Agent Tokens ───────────────────────────────────────────────────────────

  agentTokens: {
    list: () =>
      request<Array<{
        id: string;
        name: string;
        createdAt: string;
        lastConnectedAt: string | null;
        online: boolean;
      }>>("/agent-tokens"),
    create: (name: string) =>
      request<{
        id: string;
        name: string;
        createdAt: string;
        token: string; // plain token — returned only once
      }>("/agent-tokens", { method: "POST", body: JSON.stringify({ name }) }),
    revoke: (id: string) =>
      request<void>(`/agent-tokens/${id}`, { method: "DELETE" }),
  },

  // ─── Runner ─────────────────────────────────────────────────────────────────

  runner: {
    agents: () =>
      request<Array<{ tokenId: string; name: string; connectedAt: string }>>("/runner/agents"),
    start: (body: { flowId: string; environmentId: string; runtimeVariables: Record<string, string>; agentId?: string }) =>
      request<{ runId: string }>("/runner", { method: "POST", body: JSON.stringify(body) }),
    list: (flowId: string) =>
      request<TestRun[]>(`/runner?flowId=${flowId}`),
    get: (runId: string) =>
      request<TestRun & { stepResults: StepResult[] }>(`/runner/${runId}`),
    screenshotUrl: (screenshotPath: string) =>
      `${BASE}/runner/screenshots/${screenshotPath}`,
    wsUrl: (runId: string) =>
      `${BASE.replace(/^http/, "ws")}/runner/ws/${runId}`,
  },
};
