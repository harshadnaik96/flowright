import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const flowStatusEnum = pgEnum("flow_status", ["draft", "approved", "archived"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "passed", "failed", "error"]);
export const stepResultStatusEnum = pgEnum("step_result_status", ["passed", "failed", "skipped"]);
export const healingStatusEnum = pgEnum("healing_status", ["pending", "accepted", "rejected"]);
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
