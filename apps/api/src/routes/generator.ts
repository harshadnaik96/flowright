import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { flows, flowSteps, environments, selectorRegistries, testRuns, projects } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import {
  refineTestCase,
  generateSteps,
  regenerateStep,
} from "../services/gemini";
import {
  generateMaestroSteps,
  regenerateMaestroStep,
} from "../services/gemini-maestro";
import type {
  SelectorEntry,
  MobileSelectorEntry,
  FlowVariable,
  RegenerateStepRequest,
} from "@flowright/shared";

function isMobile(platform: string): boolean {
  return platform === "android" || platform === "ios";
}

export async function generatorRoutes(app: FastifyInstance) {

  // ── Refine ──────────────────────────────────────────────────────────────────
  // Takes rough tester NL → returns refined, structured NL test case
  // Tester reviews before generating steps

  app.post<{
    Body: { rawInput: string };
  }>("/refine", async (req, reply) => {
    const { rawInput } = req.body;

    if (!rawInput?.trim()) {
      return reply.status(400).send({ error: "rawInput is required" });
    }

    try {
      const refined = await refineTestCase(rawInput.trim());
      return { refined };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Refinement failed";
      app.log.error({ err }, "Refinement failed");
      return reply.status(500).send({ error: message });
    }
  });

  // ── Generate Steps ───────────────────────────────────────────────────────────
  // Takes refined NL + environmentId → generates Cypress steps + variables
  // Saves as a draft flow

  app.post<{
    Body: {
      refinedTestCase: string;
      rawTestCase: string;
      environmentId: string;
      flowName: string;
      projectId: string;
    };
  }>("/generate", async (req, reply) => {
    const { refinedTestCase, rawTestCase, environmentId, flowName, projectId } =
      req.body;

    if (!refinedTestCase?.trim())
      return reply.status(400).send({ error: "refinedTestCase is required" });
    if (!environmentId)
      return reply.status(400).send({ error: "environmentId is required" });
    if (!flowName?.trim())
      return reply.status(400).send({ error: "flowName is required" });
    if (!projectId)
      return reply.status(400).send({ error: "projectId is required" });

    // Look up project platform to decide which generator to use
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const mobile = isMobile(project.platform);

    // Load the latest crawl registry for this environment (required for web, optional for mobile).
    const [registry] = await db
      .select()
      .from(selectorRegistries)
      .where(eq(selectorRegistries.environmentId, environmentId))
      .orderBy(desc(selectorRegistries.crawledAt))
      .limit(1);

    if (!mobile && !registry) {
      return reply.status(400).send({
        error: "No selector registry found for this environment. Run a crawl first.",
      });
    }

    const entries = (registry?.entries ?? []) as SelectorEntry[] | MobileSelectorEntry[];

    try {
      const result = mobile
        ? await generateMaestroSteps(refinedTestCase.trim(), flowName.trim(), entries as MobileSelectorEntry[])
        : await generateSteps(refinedTestCase.trim(), entries as SelectorEntry[], flowName.trim());

      // Save as draft flow
      const [flow] = await db
        .insert(flows)
        .values({
          projectId,
          name: flowName.trim(),
          rawTestCase: rawTestCase?.trim() || refinedTestCase.trim(),
          variables: result.detectedVariables,
          status: "draft",
        })
        .returning();

      // Save steps
      await db.insert(flowSteps).values(
        result.steps.map((s) => ({
          flowId: flow.id,
          order: s.order,
          plainEnglish: s.plainEnglish,
          command: s.command,
          selectorUsed: s.selectorUsed ?? null,
        }))
      );

      return reply.status(201).send({
        flowId: flow.id,
        steps: result.steps,
        detectedVariables: result.detectedVariables,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Step generation failed";
      app.log.error({ err }, "Step generation failed");
      return reply.status(500).send({ error: message });
    }
  });

  // ── Regenerate single step ───────────────────────────────────────────────────
  // Tester flags a step with a plain-English correction → LLM fixes that step only

  app.post<{
    Params: { flowId: string };
    Body: RegenerateStepRequest & { environmentId: string; projectId: string; errorMessage?: string };
  }>("/regenerate-step/:flowId", async (req, reply) => {
    const { stepIndex, instruction, currentSteps, environmentId, projectId, errorMessage } = req.body;

    if (stepIndex === undefined || stepIndex < 0)
      return reply.status(400).send({ error: "stepIndex is required" });
    if (!instruction?.trim())
      return reply.status(400).send({ error: "instruction is required" });

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    const mobile = project ? isMobile(project.platform) : false;

    const [registry] = await db
      .select()
      .from(selectorRegistries)
      .where(eq(selectorRegistries.environmentId, environmentId))
      .orderBy(desc(selectorRegistries.crawledAt))
      .limit(1);

    const registryEntries = (registry?.entries ?? []) as SelectorEntry[] | MobileSelectorEntry[];

    try {
      if (mobile) {
        const fixed = await regenerateMaestroStep(
          stepIndex,
          instruction.trim(),
          currentSteps as Parameters<typeof regenerateMaestroStep>[2],
          registryEntries as MobileSelectorEntry[],
        );
        return { step: fixed };
      }

      const fixed = await regenerateStep(
        stepIndex,
        instruction.trim(),
        currentSteps as Parameters<typeof regenerateStep>[2],
        registryEntries as SelectorEntry[],
        errorMessage,
      );
      return { step: fixed };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Step regeneration failed";
      app.log.error({ err }, "Step regeneration failed");
      return reply.status(500).send({ error: message });
    }
  });

  // ── Approve flow ─────────────────────────────────────────────────────────────
  // Tester has reviewed all steps → mark flow as approved
  // Also syncs any step edits made during review back to DB

  app.post<{
    Params: { flowId: string };
    Body: {
      steps: Array<{
        order: number;
        plainEnglish: string;
        command: string;
        selectorUsed?: string | null;
      }>;
      variables: FlowVariable[];
    };
  }>("/approve/:flowId", async (req, reply) => {
    const { flowId } = req.params;
    const { steps, variables } = req.body;

    // Delete old steps and re-insert approved version
    await db.delete(flowSteps).where(eq(flowSteps.flowId, flowId));

    await db.insert(flowSteps).values(
      steps.map((s) => ({
        flowId,
        order: s.order,
        plainEnglish: s.plainEnglish,
        command: s.command,
        selectorUsed: s.selectorUsed ?? null,
      }))
    );

    const [updated] = await db
      .update(flows)
      .set({ status: "approved", variables, updatedAt: new Date() })
      .where(eq(flows.id, flowId))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Flow not found" });

    return { flowId: updated.id, status: updated.status };
  });

  // ── Regenerate an existing flow ───────────────────────────────────────────────
  // User edited the NL and wants to re-generate steps for an existing flow.
  // Clears old run history and steps, then generates fresh steps.

  app.post<{
    Params: { flowId: string };
    Body: {
      refinedTestCase: string;
      rawTestCase: string;
      environmentId: string;
      flowName: string;
    };
  }>("/regenerate-flow/:flowId", async (req, reply) => {
    const { flowId } = req.params;
    const { refinedTestCase, rawTestCase, environmentId, flowName } = req.body;

    if (!refinedTestCase?.trim())
      return reply.status(400).send({ error: "refinedTestCase is required" });
    if (!environmentId)
      return reply.status(400).send({ error: "environmentId is required" });

    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (!flow) return reply.status(404).send({ error: "Flow not found" });

    const [project] = await db.select().from(projects).where(eq(projects.id, flow.projectId));
    const mobile = project ? isMobile(project.platform) : false;

    const [flowRegistry] = await db
      .select()
      .from(selectorRegistries)
      .where(eq(selectorRegistries.environmentId, environmentId))
      .orderBy(desc(selectorRegistries.crawledAt))
      .limit(1);

    if (!mobile && !flowRegistry) {
      return reply.status(400).send({
        error: "No selector registry found for this environment. Run a crawl first.",
      });
    }

    const flowEntries = (flowRegistry?.entries ?? []) as SelectorEntry[] | MobileSelectorEntry[];

    try {
      const result = mobile
        ? await generateMaestroSteps(refinedTestCase.trim(), flowName.trim(), flowEntries as MobileSelectorEntry[])
        : await generateSteps(refinedTestCase.trim(), flowEntries as SelectorEntry[], flowName.trim());

      // Clear run history (cascades to stepResults) so the flowSteps FK is safe to drop
      await db.delete(testRuns).where(eq(testRuns.flowId, flowId));
      await db.delete(flowSteps).where(eq(flowSteps.flowId, flowId));

      // Update flow metadata and reset to draft
      await db.update(flows).set({
        name: flowName.trim(),
        rawTestCase: rawTestCase?.trim() || refinedTestCase.trim(),
        variables: result.detectedVariables,
        status: "draft",
        updatedAt: new Date(),
      }).where(eq(flows.id, flowId));

      await db.insert(flowSteps).values(
        result.steps.map((s) => ({
          flowId,
          order: s.order,
          plainEnglish: s.plainEnglish,
          command: s.command,
          selectorUsed: s.selectorUsed ?? null,
        }))
      );

      return reply.status(200).send({
        flowId,
        steps: result.steps,
        detectedVariables: result.detectedVariables,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Flow regeneration failed";
      app.log.error({ err }, "Flow regeneration failed");
      return reply.status(500).send({ error: message });
    }
  });
}
