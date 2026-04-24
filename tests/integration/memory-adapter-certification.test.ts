import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EngramMemoryAdapter, MemsearchMemoryAdapter } from "@fulcrum/memory";

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
});
