/**
 * CLI artifacts command tests — P10#10.
 * Each verb unit-tested with mock tRPC client.
 * --json output validated against Zod schema.
 * prune confirm gate tested (>100 files → requires --confirm).
 * download streams correct bytes to --out path.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

import {
  type ArtifactsClient,
  run,
  parseArtifactsArgs,
  ARTIFACTS_HELP,
} from "../../src/cli/artifacts.ts";
import { ArtifactSchema } from "../../src/trpc/schemas/artifacts.ts";

// --- Fixtures ---

function fakeArtifact(overrides: Partial<z.infer<typeof ArtifactSchema>> = {}): z.infer<typeof ArtifactSchema> {
  return {
    id: "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee",
    orgId: "11111111-2222-1333-9444-555555555555",
    projectId: null,
    runId: null,
    taskId: null,
    filename: "report.pdf",
    mime: "application/pdf",
    sizeBytes: "1024",
    path: "/store/report.pdf",
    checksumSha256: "abc123",
    metadataJson: {},
    archived: false,
    retentionUntil: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeClient(overrides: Partial<ArtifactsClient> = {}): ArtifactsClient {
  return {
    list: mock(() => Promise.resolve([fakeArtifact()])),
    show: mock(() => Promise.resolve(fakeArtifact())),
    upload: mock(() => Promise.resolve(fakeArtifact())),
    download: mock(() => Promise.resolve({ artifact: fakeArtifact(), bytes: new Uint8Array([0x50, 0x44, 0x46]) })),
    attach: mock(() => Promise.resolve({ ok: true as const })),
    detach: mock(() => Promise.resolve({ ok: true as const })),
    archive: mock(() => Promise.resolve({ ok: true as const, id: fakeArtifact().id })),
    unarchive: mock(() => Promise.resolve({ ok: true as const, id: fakeArtifact().id })),
    delete: mock(() => Promise.resolve({ ok: true as const, id: fakeArtifact().id })),
    prune: mock(() => Promise.resolve({
      candidates: [fakeArtifact()],
      totalBytes: "1024",
      totalCount: 1,
    })),
    ...overrides,
  };
}

// Capture console output
function captureOutput() {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  return {
    logs,
    errors,
    restore: () => { console.log = origLog; console.error = origErr; },
  };
}

// --- Arg parser ---

describe("parseArtifactsArgs", () => {
  it("parses verb + positional + flags", () => {
    const result = parseArtifactsArgs(["list", "--json", "--project-id", "abc"]);
    expect(result.verb).toBe("list");
    expect(result.flags["--json"]).toBe(true);
    expect(result.flags["--project-id"]).toBe("abc");
  });

  it("parses --out flag with value", () => {
    const result = parseArtifactsArgs(["download", "some-id", "--out", "/tmp/x"]);
    expect(result.verb).toBe("download");
    expect(result.positionals).toEqual(["some-id"]);
    expect(result.flags["--out"]).toBe("/tmp/x");
  });

  it("parses --hard boolean flag", () => {
    const result = parseArtifactsArgs(["delete", "some-id", "--hard"]);
    expect(result.verb).toBe("delete");
    expect(result.flags["--hard"]).toBe(true);
  });

  it("parses --confirm and --dry-run", () => {
    const result = parseArtifactsArgs(["prune", "--dry-run", "--confirm"]);
    expect(result.verb).toBe("prune");
    expect(result.flags["--dry-run"]).toBe(true);
    expect(result.flags["--confirm"]).toBe(true);
  });
});

// --- Help ---

describe("artifacts help", () => {
  it("prints help on --help", async () => {
    const out = captureOutput();
    try {
      await run(["--help"], makeClient());
      expect(out.logs.join("\n")).toContain("fulcrum artifacts");
    } finally {
      out.restore();
    }
  });

  it("prints help on no verb", async () => {
    const out = captureOutput();
    try {
      await run([], makeClient());
      expect(out.logs.join("\n")).toContain("fulcrum artifacts");
    } finally {
      out.restore();
    }
  });
});

// --- list ---

describe("artifacts list", () => {
  it("outputs JSON matching ArtifactSchema[]", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["list", "--json"], client);
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
      // Validate each row against schema (dates come back as strings in JSON)
      const JsonArtifactSchema = ArtifactSchema.extend({
        createdAt: z.string(),
        retentionUntil: z.string().nullable(),
      });
      for (const row of parsed) {
        expect(() => JsonArtifactSchema.parse(row)).not.toThrow();
      }
    } finally {
      out.restore();
    }
  });

  it("prints table in non-json mode", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["list"], client);
      expect(out.logs.join("\n")).toContain("report.pdf");
    } finally {
      out.restore();
    }
  });

  it("passes filter flags to client", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["list", "--project-id", "p1", "--archived", "--json"], client);
      expect(client.list).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "p1", archived: true }),
      );
    } finally {
      out.restore();
    }
  });
});

// --- show ---

describe("artifacts show", () => {
  it("outputs single artifact JSON", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["show", "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee", "--json"], client);
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.id).toBe("aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee");
    } finally {
      out.restore();
    }
  });

  it("errors without id", async () => {
    const out = captureOutput();
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as never;
    try {
      await run(["show"], makeClient());
      expect(exitCode).toBe(2);
    } finally {
      out.restore();
      process.exit = origExit;
    }
  });
});

// --- download ---

describe("artifacts download", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "fulcrum-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes file to --out path", async () => {
    const outPath = join(tmpDir, "downloaded.pdf");
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["download", "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee", "--out", outPath], client);
      const contents = await readFile(outPath);
      expect(contents).toEqual(Buffer.from([0x50, 0x44, 0x46]));
    } finally {
      out.restore();
    }
  });

  it("outputs JSON with --json flag", async () => {
    const outPath = join(tmpDir, "downloaded2.pdf");
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["download", "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee", "--out", outPath, "--json"], client);
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.artifact.id).toBe("aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee");
      expect(parsed.path).toBe(outPath);
    } finally {
      out.restore();
    }
  });

  it("errors without --out", async () => {
    const out = captureOutput();
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as never;
    try {
      await run(["download", "some-id"], makeClient());
      expect(exitCode).toBe(2);
    } finally {
      out.restore();
      process.exit = origExit;
    }
  });
});

// --- attach / detach ---

describe("artifacts attach", () => {
  it("calls client.attach with correct args", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["attach", "art-id", "--to-task", "task-id", "--json"], client);
      expect(client.attach).toHaveBeenCalledWith({
        id: "art-id",
        target: { kind: "task", id: "task-id" },
      });
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.ok).toBe(true);
    } finally {
      out.restore();
    }
  });

  it("supports --to-run and --to-doc", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["attach", "art-id", "--to-run", "run-id"], client);
      expect(client.attach).toHaveBeenCalledWith({
        id: "art-id",
        target: { kind: "run", id: "run-id" },
      });
    } finally {
      out.restore();
    }
  });
});

describe("artifacts detach", () => {
  it("calls client.detach with correct args", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["detach", "art-id", "--from-task", "task-id", "--json"], client);
      expect(client.detach).toHaveBeenCalledWith({
        id: "art-id",
        target: { kind: "task", id: "task-id" },
      });
    } finally {
      out.restore();
    }
  });
});

// --- archive / unarchive ---

describe("artifacts archive", () => {
  it("archives and outputs JSON", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["archive", "art-id", "--json"], client);
      expect(client.archive).toHaveBeenCalledWith({ id: "art-id" });
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.ok).toBe(true);
    } finally {
      out.restore();
    }
  });
});

describe("artifacts unarchive", () => {
  it("unarchives and outputs JSON", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["unarchive", "art-id", "--json"], client);
      expect(client.unarchive).toHaveBeenCalledWith({ id: "art-id" });
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.ok).toBe(true);
    } finally {
      out.restore();
    }
  });
});

// --- delete ---

describe("artifacts delete", () => {
  it("soft-deletes by default", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["delete", "art-id", "--json"], client);
      expect(client.delete).toHaveBeenCalledWith({ id: "art-id", hard: false });
    } finally {
      out.restore();
    }
  });

  it("hard-deletes with --hard", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["delete", "art-id", "--hard", "--json"], client);
      expect(client.delete).toHaveBeenCalledWith({ id: "art-id", hard: true });
    } finally {
      out.restore();
    }
  });
});

// --- prune ---

describe("artifacts prune", () => {
  it("prints candidates with --dry-run", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["prune", "--dry-run", "--json"], client);
      expect(client.prune).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true }),
      );
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.candidates).toHaveLength(1);
      expect(parsed.totalCount).toBe(1);
    } finally {
      out.restore();
    }
  });

  it("requires --confirm when >100 files", async () => {
    const manyArtifacts = Array.from({ length: 101 }, (_, i) =>
      fakeArtifact({ id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}` }),
    );
    const client = makeClient({
      prune: mock(() => Promise.resolve({
        candidates: manyArtifacts,
        totalBytes: "999999999",
        totalCount: 101,
      })),
    });
    const out = captureOutput();
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as never;
    try {
      await run(["prune"], client);
      expect(exitCode).toBe(1);
      expect(out.errors.join("\n")).toContain("--confirm");
    } finally {
      out.restore();
      process.exit = origExit;
    }
  });

  it("requires --confirm when >100 MB", async () => {
    const client = makeClient({
      prune: mock(() => Promise.resolve({
        candidates: [fakeArtifact({ sizeBytes: "200000000" })],
        totalBytes: "200000000",
        totalCount: 1,
      })),
    });
    const out = captureOutput();
    let exitCode: number | undefined;
    const origExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as never;
    try {
      await run(["prune"], client);
      expect(exitCode).toBe(1);
      expect(out.errors.join("\n")).toContain("--confirm");
    } finally {
      out.restore();
      process.exit = origExit;
    }
  });

  it("proceeds with --confirm when >100 files", async () => {
    const manyArtifacts = Array.from({ length: 101 }, (_, i) =>
      fakeArtifact({ id: `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}` }),
    );
    const client = makeClient({
      prune: mock(() => Promise.resolve({
        candidates: manyArtifacts,
        totalBytes: "999999999",
        totalCount: 101,
      })),
    });
    const out = captureOutput();
    try {
      await run(["prune", "--confirm", "--json"], client);
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.totalCount).toBe(101);
    } finally {
      out.restore();
    }
  });

  it("passes --project-id to client", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["prune", "--project-id", "p1", "--dry-run", "--json"], client);
      expect(client.prune).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "p1", dryRun: true }),
      );
    } finally {
      out.restore();
    }
  });
});

// --- upload ---

describe("artifacts upload", () => {
  it("calls client.upload and outputs JSON", async () => {
    const client = makeClient();
    const out = captureOutput();
    try {
      await run(["upload", "--filename", "doc.txt", "--mime", "text/plain", "--size-bytes", "100", "--json"], client);
      expect(client.upload).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "doc.txt", mime: "text/plain", sizeBytes: "100" }),
      );
      const parsed = JSON.parse(out.logs.join("\n"));
      expect(parsed.id).toBeDefined();
    } finally {
      out.restore();
    }
  });
});
