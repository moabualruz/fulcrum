import type { ContextBuildResult } from "./builder.js";

export type ContextExportFormat = "markdown" | "json" | "prompt" | "mcp";

const contextExportFormats = new Set<ContextExportFormat>(["markdown", "json", "prompt", "mcp"]);

export function isContextExportFormat(format: string): format is ContextExportFormat {
  return contextExportFormats.has(format as ContextExportFormat);
}

export function exportContextPack(result: ContextBuildResult, format: ContextExportFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2);
  }

  if (format === "mcp") {
    return JSON.stringify(
      {
        uri: `fulcrum://context-packs/${result.pack.contextPackId}`,
        name: `Fulcrum context pack ${result.pack.contextPackId}`,
        mimeType: "application/json",
        text: JSON.stringify(result, null, 2)
      },
      null,
      2
    );
  }

  const lines = [
    `# Context Pack ${result.pack.contextPackId}`,
    "",
    `Task: ${result.pack.taskId}`,
    `Budget: ${result.pack.budgetUsed}/${result.pack.budget}`,
    `Status: ${result.pack.status}`,
    `Generated: ${result.pack.generatedAt ?? "unknown"}`,
    `Redaction: ${result.pack.redactionStatus}`,
    ""
  ];

  for (const item of result.items) {
    lines.push(
      `## ${item.title}`,
      `Lane: ${item.lane}`,
      `Evidence: ${item.evidenceType}`,
      `Source: ${item.sourceRef.uri}`,
      `Reason: ${item.inclusionReason}`,
      `Freshness: ${item.freshness}`,
      `Redaction: ${item.redactionStatus}`,
      item.confidence === undefined ? "" : `Confidence: ${item.confidence}`,
      item.limitation ? `Limitation: ${item.limitation}` : "",
      item.excerptRef ? item.excerptRef : "",
      ""
    );
  }

  if (result.pack.degradedLanes.length > 0) {
    lines.push("## Degraded Lanes");
    for (const lane of result.pack.degradedLanes) {
      lines.push(
        `- ${lane.lane}: ${lane.cause}${lane.fallback ? ` Fallback: ${lane.fallback}` : ""}`
      );
    }
    lines.push("");
  }

  if (result.pack.omissions.length > 0) {
    lines.push("## Omissions");
    for (const omission of result.pack.omissions) {
      lines.push(
        `- ${omission.lane}: ${omission.reason}${
          omission.omittedRef ? ` Source: ${omission.omittedRef.uri}` : ""
        }`
      );
    }
    lines.push("");
  }

  if (result.pack.exportRefs.length > 0) {
    lines.push("## Export References");
    for (const ref of result.pack.exportRefs) {
      lines.push(`- ${ref.uri}`);
    }
  }

  if (format === "prompt") {
    lines.unshift("Use this local Fulcrum context. Preserve cited source refs in responses.", "");
  }

  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}
