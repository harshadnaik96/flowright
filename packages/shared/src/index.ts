// ─── Projects & Environments ─────────────────────────────────────────────────

export type Platform = "web" | "android" | "ios";

export interface Project {
  id: string;
  name: string;
  description?: string;
  platform: Platform;
  createdAt: string;
  updatedAt: string;
}

export type AuthType = "none" | "credentials" | "email-password" | "sso" | "custom-script";

export interface EnvironmentAuth {
  type: AuthType;
  // credentials mode (phone + otp + mpin for test environments)
  phoneNumber?: string;   // encrypted at rest
  otp?: string;           // encrypted at rest — e.g. "123456"
  mpin?: string;          // encrypted at rest — e.g. "1234"
  // email/password mode
  email?: string;         // encrypted at rest
  password?: string;      // encrypted at rest
  // sso mode — playwright storage state
  storageState?: string;  // encrypted at rest
  capturedAt?: string;    // ISO timestamp
  // custom script mode
  loginScript?: string;   // playwright TS executed before crawl
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;           // "dev" | "staging" | custom
  baseUrl: string;
  auth: EnvironmentAuth;
  seedUrls: string[];     // additional pages to crawl beyond baseUrl
  authSubflowPath?: string; // mobile only: path to generated Maestro auth subflow
  createdAt: string;
}

// ─── Selector Registry ────────────────────────────────────────────────────────

export type ElementType =
  | "button"
  | "input"
  | "link"
  | "form"
  | "select"
  | "textarea"
  | "other";

export interface SelectorEntry {
  label: string;
  selector: string;
  elementType: ElementType;
  pageUrl: string;
  textContent?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export interface MobileSelectorEntry {
  label: string;
  text?: string;
  accessibilityId?: string;
  resourceId?: string;
  bounds?: string;        // e.g. "[0,100][1080,200]"
  screen?: string;        // which screen this element was captured from
}

export interface SelectorRegistry {
  id: string;
  environmentId: string;
  entries: SelectorEntry[];
  crawledAt: string;
}

// ─── Flows ────────────────────────────────────────────────────────────────────

export type FlowStatus = "draft" | "approved" | "archived";

export interface FlowVariable {
  key: string;          // e.g. "phone_number"
  defaultValue: string; // pre-fills on next run
  description?: string; // e.g. "Phone number for this test scenario"
}

export interface Flow {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  rawTestCase: string;
  variables: FlowVariable[];
  status: FlowStatus;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export interface FlowStep {
  id: string;
  flowId: string;
  order: number;
  plainEnglish: string;
  command: string;
  selectorUsed?: string;
}

// ─── Test Runs ────────────────────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "passed" | "failed" | "error";

export interface TestRun {
  id: string;
  flowId: string;
  environmentId: string;
  status: RunStatus;
  runtimeVariables: Record<string, string>; // phone_number etc. provided at run time
  startedAt: string;
  completedAt?: string;
}

export interface StepResult {
  id: string;
  runId: string;
  stepId: string;
  order: number;
  plainEnglish: string;
  status: "passed" | "failed" | "skipped";
  screenshotPath?: string;
  errorMessage?: string;
  warningMessage?: string;
  durationMs?: number;
  attempts: number;
}

// ─── Bulk Editor ──────────────────────────────────────────────────────────────

export type BulkUpdateStepItem = {
  id: string;
  command: string;
  selectorUsed?: string | null;
};

export type BulkUpdateStepsRequest = {
  steps: BulkUpdateStepItem[];
};

export type BulkUpdateStepsResponse = {
  updated: number;
};

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  description?: string;
  platform?: Platform;
}

export interface CreateEnvironmentRequest {
  name: string;
  baseUrl: string;
  auth: EnvironmentAuth;
  seedUrls?: string[];
}

export interface CrawlRequest {
  environmentId: string;
}

export interface CrawlResponse {
  registryId: string;
  entriesFound: number;
  crawledAt: string;
}

export interface GenerateStepsRequest {
  rawTestCase: string;
  environmentId: string;
  flowName: string;
}

export interface GenerateStepsResponse {
  steps: Omit<FlowStep, "id" | "flowId">[];
  detectedVariables: FlowVariable[];
}

export interface RegenerateStepRequest {
  stepIndex: number;
  instruction: string;
  currentSteps: Omit<FlowStep, "id" | "flowId">[];
  environmentId: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventType =
  | "run:started"
  | "step:started"
  | "step:retry"
  | "step:passed"
  | "step:failed"
  | "run:completed"
  | "run:error";

export interface WsEvent {
  type: WsEventType;
  runId: string;
  payload: {
    stepOrder?: number;
    plainEnglish?: string;
    screenshotPath?: string;
    errorMessage?: string;
    warningMessage?: string;
    status?: RunStatus;
    totalSteps?: number;
    attempt?: number;
    maxAttempts?: number;
  };
}
