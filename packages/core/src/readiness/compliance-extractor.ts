import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComplianceRequirement } from "@fulcrum/shared";

export const DEFAULT_COMPLIANCE_SOURCES = [
  "FULCRUM_PRODUCT.md",
  "SRS-ammend-02.md",
  "SRS-ammend-01.md",
  "SRS.md"
];

export interface ExtractComplianceInput {
  rootDir?: string;
  sources?: string[];
}

const explicitRequirementLinePattern =
  /^((?:FR|NFR)-(?:[A-Z0-9-]+-)?\d{3}|SC-\d{3}|PRODUCT-\d{3})\s*:?\s*(.*)$/;
const requirementLanguagePattern = /\b(MUST|SHALL|must|shall|required|requires|should)\b/;

export function extractComplianceRequirements(
  input: ExtractComplianceInput = {}
): ComplianceRequirement[] {
  const rootDir = input.rootDir ?? process.cwd();
  const sources = input.sources?.length ? input.sources : DEFAULT_COMPLIANCE_SOURCES;
  const requirements: ComplianceRequirement[] = [];

  for (const sourceFile of sources) {
    const absolutePath = path.isAbsolute(sourceFile) ? sourceFile : path.join(rootDir, sourceFile);
    const sourceName = path.basename(sourceFile);
    const content = readFileSync(absolutePath, "utf8");
    const lines = content.split(/\r?\n/);
    let productSequence = 1;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === undefined) continue;
      const text = normalizeRequirementText(line);
      if (!text) continue;

      const explicitRequirement = parseExplicitRequirement(text);
      if (explicitRequirement) {
        const block = collectRequirementBlock(lines, index, explicitRequirement.inlineText);
        requirements.push(
          buildRequirement(sourceName, index + 1, explicitRequirement.requirementId, block.text)
        );
        index = block.lastLineIndex;
        continue;
      }

      if (!requirementLanguagePattern.test(text)) continue;

      const block = shouldCollectImplicitBlock(lines, index, text)
        ? collectRequirementBlock(lines, index, text)
        : { text, lastLineIndex: index };
      requirements.push(
        buildRequirement(
          sourceName,
          index + 1,
          makeSourceRequirementId(sourceName, productSequence++),
          block.text
        )
      );
      index = block.lastLineIndex;
    }
  }

  return dedupeRequirements(requirements);
}

function buildRequirement(
  sourceFile: string,
  sourceLine: number,
  requirementId: string,
  text: string
): ComplianceRequirement {
  return {
    requirementId,
    sourceFile,
    sourceLine,
    text,
    priority: sourceFile === "FULCRUM_PRODUCT.md" ? "release" : "P1",
    status: "missing",
    implementationRefs: [],
    testRefs: [],
    evidenceRefs: [],
    nextAction: "Map requirement to implementation, tests, and release evidence.",
    schemaVersion: "1.0"
  };
}

function normalizeRequirementText(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("```") || trimmed.startsWith("|")) return undefined;
  return trimmed
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^#+\s+/, "")
    .trim();
}

function parseExplicitRequirement(
  text: string
): { requirementId: string; inlineText: string | undefined } | undefined {
  const normalized = text.replace(/\*\*/g, "");
  const match = normalized.match(explicitRequirementLinePattern);
  if (!match) return undefined;
  const requirementId = match[1];
  if (!requirementId) return undefined;
  return {
    requirementId,
    inlineText: match[2] ? match[2].trim() : undefined
  };
}

function collectRequirementBlock(
  lines: string[],
  requirementLineIndex: number,
  inlineText?: string
): { text: string; lastLineIndex: number } {
  const parts = inlineText ? [inlineText] : [];
  let lastLineIndex = requirementLineIndex;
  let inCodeBlock = false;
  let sawContinuation = false;

  for (let index = requirementLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      lastLineIndex = index;
      continue;
    }
    if (inCodeBlock) {
      if (trimmed) {
        parts.push(trimmed);
        sawContinuation = true;
      }
      lastLineIndex = index;
      continue;
    }
    const normalized = normalizeRequirementText(line);
    if (!normalized) {
      if (sawContinuation) break;
      lastLineIndex = index;
      continue;
    }
    if (parseExplicitRequirement(normalized) || trimmed.startsWith("#")) break;
    parts.push(normalized);
    sawContinuation = true;
    lastLineIndex = index;
  }

  const fallbackText = normalizeRequirementText(lines[requirementLineIndex] ?? "") ?? "";
  return {
    text: parts.join(" ").trim() || fallbackText,
    lastLineIndex
  };
}

function shouldCollectImplicitBlock(
  lines: string[],
  requirementLineIndex: number,
  text: string
): boolean {
  if (text.endsWith(":")) return true;
  for (let index = requirementLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("#")) return false;
    return (
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("```") ||
      /^\d+\./.test(trimmed)
    );
  }
  return false;
}

function makeSourceRequirementId(sourceName: string, sequence: number): string {
  const prefix =
    sourceName === "FULCRUM_PRODUCT.md"
      ? "PRODUCT"
      : sourceName === "SRS-ammend-02.md"
        ? "SRS-AMEND-02"
        : sourceName === "SRS-ammend-01.md"
          ? "SRS-AMEND-01"
          : "SRS";
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

function dedupeRequirements(requirements: ComplianceRequirement[]): ComplianceRequirement[] {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = `${requirement.requirementId}:${requirement.sourceFile}:${requirement.sourceLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
