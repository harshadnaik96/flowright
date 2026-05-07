import type { Page } from "playwright";
import { extractElements } from "./crawler";
import { proposeSelectorFix } from "./gemini";
import { db } from "../db/client";
import { selectorHealings, flowSteps, flows } from "../db/schema";
import { and, eq, desc } from "drizzle-orm";

const SELECTOR_ERROR_PATTERNS = [
  /Timeout.*exceeded/i,
  /not found/i,
  /strict mode violation/i,
  /resolved to 0 elements/i,
  /waiting for .* to be (visible|attached|hidden)/i,
  /Could not (click|type|check|select)/i,
  /was not found on the page/i,
];

export function isSelectorPatternError(message: string | undefined): boolean {
  if (!message) return false;
  return SELECTOR_ERROR_PATTERNS.some((re) => re.test(message));
}

// Best-effort extraction of the primary selector argument from a cy command.
// e.g. cy.get('[data-testid="x"]').click() → '[data-testid="x"]'
//      cy.contains('Submit').click()       → 'Submit'
export function extractSelectorFromCommand(cmd: string): string | null {
  const getMatch  = cmd.match(/cy\.get\(\s*(['"])((?:\\\1|.)*?)\1\s*\)/);
  if (getMatch) return getMatch[2];
  const containsMatch = cmd.match(/cy\.contains\(\s*(['"])((?:\\\1|.)*?)\1\s*\)/);
  if (containsMatch) return containsMatch[2];
  return null;
}

export interface HealResult {
  healedCommand: string;
  healedSelector: string | null;
  originalSelector: string | null;
  reasoning: string;
}

/**
 * Attempts to heal a failed selector by re-extracting the live DOM and asking
 * Gemini for a replacement command. Returns null if not heal-able.
 */
export async function healSelector(args: {
  page: Page;
  command: string;
  plainEnglish: string;
  errorMessage: string;
}): Promise<HealResult | null> {
  if (!isSelectorPatternError(args.errorMessage)) return null;

  let liveElements;
  try {
    liveElements = await extractElements(args.page, args.page.url());
  } catch {
    return null;
  }
  if (!liveElements || liveElements.length === 0) return null;

  const proposal = await proposeSelectorFix({
    failedCommand: args.command,
    errorMessage: args.errorMessage,
    plainEnglish: args.plainEnglish,
    liveElements,
  });
  if (!proposal) return null;

  return {
    healedCommand: proposal.healedCommand,
    healedSelector: proposal.healedSelector || null,
    originalSelector: extractSelectorFromCommand(args.command),
    reasoning: proposal.reasoning,
  };
}

/**
 * Compact "stability hints" payload for Gemini prompts: accepted self-heal
 * proposals from prior runs in the same project. The intent is to bias future
 * generation toward selectors that have already proven stable, instead of
 * re-deriving them from a possibly stale registry.
 *
 * Scoped to projectId (not environment) because the same app under test may
 * be reachable via multiple environments — a heal that worked in staging is a
 * useful signal for prod.
 */
export interface StabilityHint {
  plainEnglish: string;
  originalSelector: string | null;
  healedSelector: string | null;
  healedCommand: string;
}

export async function getStabilityHints(
  projectId: string,
  limit = 30,
): Promise<StabilityHint[]> {
  const rows = await db
    .select({
      healing: selectorHealings,
      step: { plainEnglish: flowSteps.plainEnglish },
    })
    .from(selectorHealings)
    .innerJoin(flowSteps, eq(flowSteps.id, selectorHealings.stepId))
    .innerJoin(flows, eq(flows.id, selectorHealings.flowId))
    .where(and(eq(selectorHealings.status, "accepted"), eq(flows.projectId, projectId)))
    .orderBy(desc(selectorHealings.reviewedAt))
    .limit(limit);

  return rows.map((r) => ({
    plainEnglish: r.step.plainEnglish,
    originalSelector: r.healing.originalSelector,
    healedSelector: r.healing.healedSelector,
    healedCommand: r.healing.healedCommand,
  }));
}

export async function getStabilityHintsForFlow(
  flowId: string,
  limit = 30,
): Promise<StabilityHint[]> {
  const rows = await db
    .select({
      healing: selectorHealings,
      step: { plainEnglish: flowSteps.plainEnglish },
    })
    .from(selectorHealings)
    .innerJoin(flowSteps, eq(flowSteps.id, selectorHealings.stepId))
    .where(and(eq(selectorHealings.status, "accepted"), eq(selectorHealings.flowId, flowId)))
    .orderBy(desc(selectorHealings.reviewedAt))
    .limit(limit);

  return rows.map((r) => ({
    plainEnglish: r.step.plainEnglish,
    originalSelector: r.healing.originalSelector,
    healedSelector: r.healing.healedSelector,
    healedCommand: r.healing.healedCommand,
  }));
}
