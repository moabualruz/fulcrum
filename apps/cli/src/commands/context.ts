import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  exportContextPack,
  type ContextBuildInput,
  type ContextExportFormat,
  type ContextPackBuilder
} from "@fulcrum/core";

const contextExportFormats = new Set<ContextExportFormat>(["markdown", "json", "prompt", "mcp"]);

function isContextExportFormat(format: string): format is ContextExportFormat {
  return contextExportFormats.has(format as ContextExportFormat);
}

export function buildContextCommand(builder: ContextPackBuilder, input: ContextBuildInput) {
  return builder.build(input);
}

export function showContextCommand(builder: ContextPackBuilder, contextPackId: string) {
  return builder.get(contextPackId);
}

export function explainContextCommand(builder: ContextPackBuilder, contextPackId: string) {
  const result = builder.get(contextPackId);
  if (!result) {
    return undefined;
  }
  return {
    contextPackId,
    items: result.items.map((item) => ({
      contextItemId: item.contextItemId,
      lane: item.lane,
      sourceRef: item.sourceRef,
      evidenceType: item.evidenceType,
      inclusionReason: item.inclusionReason,
      limitation: item.limitation,
      freshness: item.freshness,
      rank: item.rank
    })),
    omissions: result.pack.omissions,
    degradedLanes: result.pack.degradedLanes
  };
}

export function exportContextCommand(
  builder: ContextPackBuilder,
  contextPackId: string,
  format: string
) {
  if (!isContextExportFormat(format)) {
    throw new Error(`Unsupported context export format: ${format}`);
  }
  const result = builder.get(contextPackId);
  return result ? exportContextPack(result, format) : undefined;
}

export function writeContextExport(outputPath: string, content: string) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  return { outputPath, bytes: Buffer.byteLength(content, "utf8") };
}
