import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MemoryEntry } from "@fulcrum/shared";
import { MarkdownMemoryAdapter } from "./markdown-adapter.js";
import { probeMemoryExecutable } from "./probe.js";
import type { MemorySearchInput, MemorySearchResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class MemsearchMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "memsearch";

  override async search(
    input: MemorySearchInput,
    entries: MemoryEntry[]
  ): Promise<MemorySearchResult[]> {
    const health = this.health();
    if (health.state !== "managed") {
      return super.search(input, entries);
    }

    try {
      const { stdout } = await execFileAsync(
        "memsearch",
        ["search", input.query, "--top-k", String(input.limit ?? 20), "--json-output"],
        { encoding: "utf8", timeout: 10_000, maxBuffer: 5 * 1024 * 1024 }
      );
      const matches = rankEntriesFromMemsearch(stdout, entries);
      if (matches.length > 0) return matches.slice(0, input.limit ?? 20);
      const fallback = await super.search(input, entries);
      return fallback.map((result) => ({
        ...result,
        limitation: "memsearch returned no local memory matches; local markdown index used."
      }));
    } catch (error) {
      const fallback = await super.search(input, entries);
      return fallback.map((result) => ({
        ...result,
        limitation: `${error instanceof Error ? error.message : "memsearch search failed"}; local markdown index used.`
      }));
    }
  }

  override health() {
    const probe = probeMemoryExecutable("memsearch", "FULCRUM_MEMSEARCH_ENABLED");
    return {
      state: probe.state,
      limitation:
        probe.state === "managed" ? undefined : `${probe.reason}; local markdown index used.`,
      nextAction:
        probe.state === "managed"
          ? undefined
          : "Install memsearch and set FULCRUM_MEMSEARCH_ENABLED=1 after configuring it.",
      version: probe.version,
      executable: probe.executable
    };
  }
}

interface MemsearchJsonResult {
  content?: string;
  source?: string;
  heading?: string;
  score?: number;
}

function rankEntriesFromMemsearch(stdout: string, entries: MemoryEntry[]): MemorySearchResult[] {
  const parsed = parseJson(stdout);
  if (!parsed) return [];
  return parsed
    .flatMap((result) => {
      const entry = entries.find((candidate) => matchesResult(candidate, result));
      if (!entry) return [];
      return [
        {
          entry,
          rank: typeof result.score === "number" ? result.score : 1,
          reason: "Query matched memsearch semantic memory result."
        }
      ];
    })
    .sort((a, b) => b.rank - a.rank);
}

function parseJson(stdout: string): MemsearchJsonResult[] | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? (parsed as MemsearchJsonResult[]) : undefined;
  } catch {
    return undefined;
  }
}

function matchesResult(entry: MemoryEntry, result: MemsearchJsonResult): boolean {
  const haystack = [
    entry.title,
    entry.excerpt,
    ...entry.sourceRefs.flatMap((ref) => [ref.uri, ref.label])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return [result.source, result.heading, result.content]
    .filter(Boolean)
    .some((value) => haystack.includes(String(value).toLowerCase().slice(0, 80)));
}
