import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeId, MemoryEntrySchema, SCHEMA_VERSION, type MemoryEntry } from "@fulcrum/shared";
import type {
  MemoryAdapter,
  MemoryImportInput,
  MemorySearchInput,
  MemorySearchResult
} from "./types.js";

export class MarkdownMemoryAdapter implements MemoryAdapter {
  readonly backend: string = "markdown";

  async import(input: MemoryImportInput): Promise<MemoryEntry[]> {
    const absolutePath = path.resolve(input.path);
    const raw = await readFile(absolutePath, "utf8");
    const { title, body } = parseMarkdown(raw, absolutePath);
    const now = new Date().toISOString();
    return [
      MemoryEntrySchema.parse({
        memoryId: makeId("mem", `${input.projectId}-${absolutePath}`),
        projectId: input.projectId,
        status: "active",
        title,
        bodyRef: `file://${absolutePath}`,
        excerpt: body.slice(0, 500),
        sourceRefs: [{ type: "file", uri: absolutePath, label: title }],
        backend: this.backend,
        freshness: "fresh",
        redactionStatus: "not_redacted",
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    ];
  }

  async search(input: MemorySearchInput, entries: MemoryEntry[]): Promise<MemorySearchResult[]> {
    const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
    return entries
      .map((entry) => {
        const haystack =
          `${entry.title} ${entry.excerpt ?? ""} ${entry.sourceRefs.map((ref) => ref.uri).join(" ")}`.toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return {
          entry,
          rank: score,
          reason: score > 0 ? "Query matched local markdown memory." : "No direct term match."
        };
      })
      .filter((result) => result.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, input.limit ?? 20);
  }

  health(): ReturnType<MemoryAdapter["health"]> {
    return { state: "managed" };
  }
}

function parseMarkdown(raw: string, filePath: string): { title: string; body: string } {
  const withoutFrontmatter = raw.startsWith("---") ? raw.replace(/^---[\s\S]*?---\s*/, "") : raw;
  const heading = withoutFrontmatter.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return { title: heading ?? path.basename(filePath), body: withoutFrontmatter.trim() };
}
