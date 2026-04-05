import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const flowStatusEnum = pgEnum("flow_status", ["draft", "approved", "archived"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "passed", "failed", "error"]);
export const stepResultStatusEnum = pgEnum("step_result_status", ["passed", "failed", "skipped"]);
export const authTypeEnum = pgEnum("auth_type", ["none", "credentials", "email-password", "sso", "custom-script"]);

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
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
  cypressCommand: text("cypress_command").notNull(),
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
});
