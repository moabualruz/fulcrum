import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EngramMemoryAdapter, MemsearchMemoryAdapter } from "@fulcrum/memory";
import type { MemoryEntry } from "@fulcrum/shared";

describe("memory adapter certification", () => {
  it("executes memsearch and Engram probes when explicitly enabled", () => {
    const bin = mkdtempSync(path.join(tmpdir(), "fulcrum-memory-bin-"));
    const previousPath = process.env.PATH;
    const previousMemsearch = process.env.FULCRUM_MEMSEARCH_ENABLED;
    const previousEngram = process.env.FULCRUM_ENGRAM_ENABLED;
    writeFileSync(path.join(bin, "memsearch"), "#!/usr/bin/env sh\nprintf 'memsearch 1.2.3\\n'\n");
    writeFileSync(path.join(bin, "engram"), "#!/usr/bin/env sh\nprintf 'engram 4.5.6\\n'\n");
    chmodSync(path.join(bin, "memsearch"), 0o755);
    chmodSync(path.join(bin, "engram"), 0o755);
    process.env.PATH = previousPath ? `${bin}${path.delimiter}${previousPath}` : bin;
    process.env.FULCRUM_MEMSEARCH_ENABLED = "1";
    process.env.FULCRUM_ENGRAM_ENABLED = "1";

    try {
      expect(new MemsearchMemoryAdapter().health()).toMatchObject({
        state: "managed",
        executable: "memsearch",
        version: "memsearch 1.2.3"
      });
      expect(new EngramMemoryAdapter().health()).toMatchObject({
        state: "managed",
        executable: "engram",
        version: "engram 4.5.6"
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousMemsearch === undefined) delete process.env.FULCRUM_MEMSEARCH_ENABLED;
      else process.env.FULCRUM_MEMSEARCH_ENABLED = previousMemsearch;
      if (previousEngram === undefined) delete process.env.FULCRUM_ENGRAM_ENABLED;
      else process.env.FULCRUM_ENGRAM_ENABLED = previousEngram;
      rmSync(bin, { force: true, recursive: true });
    }
  });

  it("uses enabled memory executables for search before markdown fallback", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "fulcrum-memory-search-bin-"));
    const previousPath = process.env.PATH;
    const previousMemsearch = process.env.FULCRUM_MEMSEARCH_ENABLED;
    const previousEngram = process.env.FULCRUM_ENGRAM_ENABLED;
    writeFileSync(
      path.join(bin, "memsearch"),
      [
        "#!/usr/bin/env sh",
        'if [ "$1" = "--version" ]; then printf \'memsearch 1.2.3\\n\'; exit 0; fi',
        'printf \'[{"source":"decision.md","heading":"Search Decision","content":"Use indexed memory","score":0.9}]\\n\''
      ].join("\n")
    );
    writeFileSync(
      path.join(bin, "engram"),
      [
        "#!/usr/bin/env sh",
        'if [ "$1" = "--version" ]; then printf \'engram 4.5.6\\n\'; exit 0; fi',
        "printf 'Search Decision\\ndecision.md\\nUse indexed memory\\n'"
      ].join("\n")
    );
    chmodSync(path.join(bin, "memsearch"), 0o755);
    chmodSync(path.join(bin, "engram"), 0o755);
    process.env.PATH = previousPath ? `${bin}${path.delimiter}${previousPath}` : bin;
    process.env.FULCRUM_MEMSEARCH_ENABLED = "1";
    process.env.FULCRUM_ENGRAM_ENABLED = "1";

    const entry = memoryEntry();
    try {
      const memsearch = await new MemsearchMemoryAdapter().search(
        { projectId: entry.projectId, query: "decision" },
        [entry]
      );
      const engram = await new EngramMemoryAdapter().search(
        { projectId: entry.projectId, query: "decision" },
        [entry]
      );

      expect(memsearch[0]).toMatchObject({
        entry,
        reason: "Query matched memsearch semantic memory result."
      });
      expect(engram[0]).toMatchObject({
        entry,
        reason: "Query matched Engram memory search output."
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousMemsearch === undefined) delete process.env.FULCRUM_MEMSEARCH_ENABLED;
      else process.env.FULCRUM_MEMSEARCH_ENABLED = previousMemsearch;
      if (previousEngram === undefined) delete process.env.FULCRUM_ENGRAM_ENABLED;
      else process.env.FULCRUM_ENGRAM_ENABLED = previousEngram;
      rmSync(bin, { force: true, recursive: true });
    }
  });
});

function memoryEntry(): MemoryEntry {
  return {
    memoryId: "mem_search_decision",
    projectId: "proj_memory",
    status: "active",
    title: "Search Decision",
    bodyRef: "file:///tmp/decision.md",
    excerpt: "Use indexed memory",
    sourceRefs: [{ type: "file", uri: "decision.md", label: "Search Decision" }],
    linkedTaskIds: [],
    linkedRunIds: [],
    linkedFileRefs: [],
    linkedSymbolRefs: [],
    linkedArtifactIds: [],
    backend: "markdown",
    freshness: "fresh",
    exportStatus: "not_exported",
    redactionStatus: "not_redacted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: "1.0"
  };
}
