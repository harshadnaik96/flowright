import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const flowStatusEnum = pgEnum("flow_status", ["draft", "approved", "archived"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "passed", "failed", "error"]);
export const stepResultStatusEnum = pgEnum("step_result_status", ["passed", "failed", "skipped"]);
export const healingStatusEnum = pgEnum("healing_status", ["pending", "accepted", "rejected"]);
export const healOutcomeEnum = pgEnum("heal_outcome", [
  "no_proposal",      // Gemini returned nothing usable (or extraction yielded zero elements)
  "recovered",        // healed command succeeded on a subsequent attempt
  "failed_after_heal" // healed command was applied but the step still ultimately failed
]);
export const authTypeEnum = pgEnum("auth_type", ["none", "credentials", "email-password", "sso", "custom-script"]);
export const platformEnum = pgEnum("platform", ["web", "android", "ios"]);

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  platform: platformEnum("platform").default("web").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Environments ─────────────────────────────────────────────────────────────
// auth jsonb stores EnvironmentAuth — sensitive fields are AES-256 encrypted
// seedUrls jsonb stores string[]

export const environments = pgTable("environments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  auth: jsonb("auth").notNull().default("{}"),      // EnvironmentAuth (encrypted fields)
  seedUrls: jsonb("seed_urls").notNull().default("[]"), // string[]
  authSubflowPath: text("auth_subflow_path"),        // mobile only: path to generated Maestro auth subflow
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Selector Registries ──────────────────────────────────────────────────────
// One registry per crawl — latest by crawledAt is the active one

export const selectorRegistries = pgTable("selector_registries", {
  id: uuid("id").primaryKey().defaultRandom(),
  environmentId: uuid("environment_id")
    .references(() => environments.id, { onDelete: "cascade" })
    .notNull(),
  entries: jsonb("entries").notNull().default("[]"),  // SelectorEntry[]
  crawledAt: timestamp("crawled_at").defaultNow().notNull(),
});

// ─── Flows ────────────────────────────────────────────────────────────────────

export const flows = pgTable("flows", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  rawTestCase: text("raw_test_case").notNull(),
  variables: jsonb("variables").notNull().default("[]"), // FlowVariable[]
  status: flowStatusEnum("status").default("draft").notNull(),
  maxRetries: integer("max_retries").default(2).notNull(),
  // Self-referencing FK: run this flow's steps first in the same browser session
  prerequisiteFlowId: uuid("prerequisite_flow_id").references((): AnyPgColumn => flows.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Flow Steps ───────────────────────────────────────────────────────────────

export const flowSteps = pgTable("flow_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  flowId: uuid("flow_id")
    .references(() => flows.id, { onDelete: "cascade" })
    .notNull(),
  order: integer("order").notNull(),
  plainEnglish: text("plain_english").notNull(),
  command: text("command").notNull(),
  selectorUsed: text("selector_used"),
});

// ─── Test Runs ────────────────────────────────────────────────────────────────

export const testRuns = pgTable("test_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  flowId: uuid("flow_id")
    .references(() => flows.id, { onDelete: "cascade" })
    .notNull(),
  environmentId: uuid("environment_id")
    .references(() => environments.id)
    .notNull(),
  status: runStatusEnum("status").default("pending").notNull(),
  runtimeVariables: jsonb("runtime_variables").notNull().default("{}"), // Record<string, string>
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── Agent Tokens ─────────────────────────────────────────────────────────────
// Each tester generates a token to authenticate their local Flowright agent.
// The plain token is shown once — only the SHA-256 hash is stored.

export const agentTokens = pgTable("agent_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),                  // e.g. "Harshad's MacBook"
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 of plain token
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastConnectedAt: timestamp("last_connected_at"), // updated on each WS connect
});

// ─── Step Results ─────────────────────────────────────────────────────────────

export const stepResults = pgTable("step_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => testRuns.id, { onDelete: "cascade" })
    .notNull(),
  stepId: uuid("step_id")
    .references(() => flowSteps.id)
    .notNull(),
  order: integer("order").notNull(),
  plainEnglish: text("plain_english").notNull(),
  status: stepResultStatusEnum("status").notNull(),
  screenshotPath: text("screenshot_path"),
  errorMessage: text("error_message"),
  warningMessage: text("warning_message"),
  durationMs: integer("duration_ms"),
  attempts: integer("attempts").default(1).notNull(),
  wasHealed: boolean("was_healed").default(false).notNull(),
});

// ─── Selector Healings ────────────────────────────────────────────────────────
// Audit trail for runtime-healed selectors. Proposals start as "pending" — a
// human reviews each and either accepts (which can be applied to flowSteps.command)
// or rejects. We never auto-mutate flowSteps.command.

export const selectorHealings = pgTable("selector_healings", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => testRuns.id, { onDelete: "cascade" })
    .notNull(),
  stepId: uuid("step_id")
    .references(() => flowSteps.id, { onDelete: "cascade" })
    .notNull(),
  flowId: uuid("flow_id")
    .references(() => flows.id, { onDelete: "cascade" })
    .notNull(),
  originalCommand: text("original_command").notNull(),
  healedCommand: text("healed_command").notNull(),
  originalSelector: text("original_selector"),
  healedSelector: text("healed_selector"),
  errorMessage: text("error_message"),
  screenshotPath: text("screenshot_path"),     // post-heal screenshot for review
  status: healingStatusEnum("status").default("pending").notNull(),
  healedAt: timestamp("healed_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

// ─── Heal Telemetry ───────────────────────────────────────────────────────────
// One row per heal *attempt* regardless of outcome — including failures and
// no-proposal cases (which selector_healings drops). This is the raw signal
// for measuring heal quality: success rate, latency, false-positive triggers,
// proposals that didn't recover the step.

export const healTelemetry = pgTable("heal_telemetry", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => testRuns.id, { onDelete: "cascade" })
    .notNull(),
  stepId: uuid("step_id")
    .references(() => flowSteps.id, { onDelete: "cascade" })
    .notNull(),
  flowId: uuid("flow_id")
    .references(() => flows.id, { onDelete: "cascade" })
    .notNull(),
  attempt: integer("attempt").notNull(),                     // which retry attempt triggered the heal
  triggerErrorMessage: text("trigger_error_message").notNull(),
  elementsExtracted: integer("elements_extracted").default(0).notNull(),
  liveExtractMs: integer("live_extract_ms").default(0).notNull(),
  proposalLatencyMs: integer("proposal_latency_ms").default(0).notNull(),
  proposalReceived: boolean("proposal_received").default(false).notNull(),
  rejectedReason: text("rejected_reason"),                   // null when proposal accepted; else: 'no_text', 'unchanged_command', 'empty_selector', 'parse_error', 'extract_failed', 'extract_empty'
  originalCommand: text("original_command").notNull(),
  proposedCommand: text("proposed_command"),                 // null if no proposal
  originalSelector: text("original_selector"),
  proposedSelector: text("proposed_selector"),
  reasoning: text("reasoning"),                              // Gemini's explanation; useful for prompt iteration
  outcome: healOutcomeEnum("outcome").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
