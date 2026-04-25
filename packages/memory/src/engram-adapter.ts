import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MemoryEntry } from "@fulcrum/shared";
import { MarkdownMemoryAdapter } from "./markdown-adapter.js";
import { probeMemoryExecutable } from "./probe.js";
import type { MemorySearchInput, MemorySearchResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class EngramMemoryAdapter extends MarkdownMemoryAdapter {
  readonly backend = "engram";

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
        "engram",
        ["search", input.query, "--limit", String(input.limit ?? 20)],
        { encoding: "utf8", timeout: 10_000, maxBuffer: 5 * 1024 * 1024 }
      );
      const matches = rankEntriesFromText(stdout, entries);
      if (matches.length > 0) return matches.slice(0, input.limit ?? 20);
      const fallback = await super.search(input, entries);
      return fallback.map((result) => ({
        ...result,
        limitation: "Engram returned no local memory matches; local markdown index used."
      }));
    } catch (error) {
      const fallback = await super.search(input, entries);
      return fallback.map((result) => ({
        ...result,
        limitation: `${error instanceof Error ? error.message : "Engram search failed"}; local markdown index used.`
      }));
    }
  }

  override health() {
    const probe = probeMemoryExecutable("engram", "FULCRUM_ENGRAM_ENABLED");
    return {
      state: probe.state,
      limitation:
        probe.state === "managed" ? undefined : `${probe.reason}; local markdown index used.`,
      nextAction:
        probe.state === "managed"
          ? undefined
          : "Install Engram and set FULCRUM_ENGRAM_ENABLED=1 after configuring it.",
      version: probe.version,
      executable: probe.executable
    };
  }
}

function rankEntriesFromText(stdout: string, entries: MemoryEntry[]): MemorySearchResult[] {
  const normalized = stdout.toLowerCase();
  return entries
    .map((entry) => {
      const fields = [
        entry.title,
        entry.excerpt,
        ...entry.sourceRefs.flatMap((ref) => [ref.uri, ref.label])
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const rank = fields.reduce(
        (total, value) => total + (normalized.includes(value.slice(0, 80)) ? 1 : 0),
        0
      );
      return {
        entry,
        rank,
        reason: "Query matched Engram memory search output."
      };
    })
    .filter((result) => result.rank > 0)
    .sort((a, b) => b.rank - a.rank);
}
