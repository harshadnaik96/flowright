import type { FlowStep } from "@flowright/shared";

// Sentinel header format:
//   // ── Step 1: Plain English description ─────────────────────────
const HEADER_PREFIX = "// ── Step ";
const HEADER_REGEX = /^\/\/ ── Step (\d+): .+ ─+$/;

export function buildEditorDocument(steps: FlowStep[]): string {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return sorted
    .map((step) => {
      const header = buildHeader(step.order, step.plainEnglish);
      return `${header}\n${step.command}`;
    })
    .join("\n\n");
}

function buildHeader(order: number, plainEnglish: string): string {
  const prefix = `${HEADER_PREFIX}${order}: ${plainEnglish} `;
  const padLength = Math.max(1, 72 - prefix.length);
  return prefix + "─".repeat(padLength);
}

export type ParsedStep = {
  id: string;
  order: number;
  command: string;
};

export type ParseResult = {
  parsed: ParsedStep[];
  errors: string[];
};

export function parseEditorDocument(
  content: string,
  originalSteps: FlowStep[]
): ParseResult {
  const lines = content.split("\n");
  const errors: string[] = [];

  type Block = { order: number; lines: string[] };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const match = line.match(HEADER_REGEX);
    if (match) {
      if (current) blocks.push(current);
      current = { order: parseInt(match[1], 10), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);

  // Validate step count
  if (blocks.length !== originalSteps.length) {
    errors.push(
      `Expected ${originalSteps.length} step headers but found ${blocks.length}. ` +
        `Do not delete or duplicate the comment headers.`
    );
    return { parsed: [], errors };
  }

  const parsed: ParsedStep[] = [];

  for (const block of blocks) {
    const original = originalSteps.find((s) => s.order === block.order);
    if (!original) {
      errors.push(
        `Step ${block.order} header refers to an unknown step order. Do not change step numbers.`
      );
      continue;
    }

    // Trim trailing blank lines from the block body
    const bodyLines = [...block.lines];
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === "") {
      bodyLines.pop();
    }

    const command = bodyLines.join("\n").trim();

    if (!command) {
      errors.push(
        `Step ${block.order} ("${original.plainEnglish}") has no commands. ` +
          `Add at least one Cypress command or revert your changes.`
      );
      continue;
    }

    parsed.push({ id: original.id, order: block.order, command });
  }

  return { parsed, errors };
}

export function getStepOrderAtLine(
  lines: string[],
  lineNumber: number
): number | null {
  // lineNumber is 1-indexed (Monaco convention)
  for (let i = lineNumber - 1; i >= 0; i--) {
    const match = lines[i]?.match(HEADER_REGEX);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

export function getHeaderLineForOrder(
  lines: string[],
  order: number
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]?.match(HEADER_REGEX);
    if (match && parseInt(match[1], 10) === order) {
      return i + 1; // 1-indexed
    }
  }
  return null;
}

export { HEADER_REGEX };
