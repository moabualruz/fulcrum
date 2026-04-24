import { redactText } from "@fulcrum/policy";
import type { MemoryEntry } from "@fulcrum/shared";

export interface MemoryExportRecord {
  exportedAt: string;
  redactionStatus: "not_redacted" | "redacted" | "needs_review" | "not_applicable";
  entries: Array<{
    memoryId: string;
    projectId: string;
    status: MemoryEntry["status"];
    title: string;
    excerpt?: string;
    sourceRefs: MemoryEntry["sourceRefs"];
    linkedTaskIds: string[];
    linkedRunIds: string[];
    backend: string;
    freshness: MemoryEntry["freshness"];
    redactionStatus: MemoryEntry["redactionStatus"];
  }>;
}

export function exportMemoryWithProvenance(entries: MemoryEntry[]): MemoryExportRecord {
  const exported = entries.map((entry) => {
    const title = redactText(entry.title);
    const excerpt = redactText(entry.excerpt ?? "");
    return {
      memoryId: entry.memoryId,
      projectId: entry.projectId,
      status: entry.status,
      title: title.text,
      excerpt: entry.excerpt ? excerpt.text : undefined,
      sourceRefs: entry.sourceRefs,
      linkedTaskIds: entry.linkedTaskIds,
      linkedRunIds: entry.linkedRunIds,
      backend: entry.backend,
      freshness: entry.freshness,
      redactionStatus: title.redacted || excerpt.redacted ? "redacted" : entry.redactionStatus
    };
  });
  return {
    exportedAt: new Date().toISOString(),
    redactionStatus: exported.some((entry) => entry.redactionStatus === "needs_review")
      ? "needs_review"
      : exported.some((entry) => entry.redactionStatus === "redacted")
        ? "redacted"
        : "not_redacted",
    entries: exported
  };
}
