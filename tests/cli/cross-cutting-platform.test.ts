import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

type Harness = {
  lines: string[];
  errLines: string[];
  exitCode?: number;
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
};

function harness(): Harness {
  const h: Harness = {
    lines: [],
    errLines: [],
    print: (line) => h.lines.push(line),
    printErr: (line) => h.errLines.push(line),
    exit: (code) => {
      h.exitCode = code;
    },
  };
  return h;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-cross-cli-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("cross-cutting CLI surfaces", () => {
  it("theme list --json returns typed theme settings", async () => {
    const { runTheme } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runTheme(["list", "--json"], {
      caller: {
        theme: {
          listThemes: async () => [{ key: "theme.accent", value: "#123456", defaultValue: "#6D28D9" }],
        },
      },
      ...h,
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual([{ key: "theme.accent", value: "#123456" }]);
  });

  it("secrets set reads stdin and never prints secret value", async () => {
    const { runSecrets } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();
    let storedValue = "";

    await runSecrets(["set", "MY_KEY", "--json"], {
      stdin: async () => "sk-live-secret\n",
      caller: {
        credentials: {
          set: async (input: { name: string; value: string }) => {
            storedValue = input.value;
            return { id: "cred-1", name: input.name, created_at: "2026-05-03T00:00:00.000Z" };
          },
        },
      },
      ...h,
    });

    expect(storedValue).toBe("sk-live-secret");
    expect(h.lines.join("\n")).not.toContain("sk-live-secret");
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      id: "cred-1",
      name: "MY_KEY",
      created_at: "2026-05-03T00:00:00.000Z",
    });
  });

  it("secrets get --json masks values by default", async () => {
    const { runSecrets } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runSecrets(["get", "MY_KEY", "--json"], {
      caller: {
        credentials: {
          get: async () => ({ name: "MY_KEY", masked_value: "***", last_used_at: null }),
        },
      },
      ...h,
    });

    expect(JSON.parse(h.lines[0] as string)).toEqual({
      name: "MY_KEY",
      masked_value: "***",
      last_used_at: null,
    });
  });

  it("errors list --since filters through caller and emits JSON", async () => {
    const { runErrors } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();
    let since: Date | undefined;

    await runErrors(["list", "--since", "2026-05-01", "--json"], {
      caller: {
        errorLogs: {
          list: async (input: { since?: Date }) => {
            since = input.since;
            return [{ id: "err-1", errorMessage: "boom" }];
          },
        },
      },
      ...h,
    });

    expect(since?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(JSON.parse(h.lines[0] as string)).toEqual([{ id: "err-1", errorMessage: "boom" }]);
  });

  it("backup --output writes dump, reports progress on stderr, and emits manifest JSON", async () => {
    const { runBackup } = await import("../../src/cli/commands/cross-cutting-platform.ts");

    await withTempDir(async (dir) => {
      const h = harness();
      const output = join(dir, "b.tar.gz");

      await runBackup(["--output", output, "--json"], {
        caller: {
          backup: {
            create: async () => ({
              dump: Buffer.from("payload").toString("base64"),
              entityCounts: { tasks: 2 },
            }),
          },
        },
        ...h,
      });

      expect(await readFile(output, "utf8")).toContain("payload");
      expect(h.errLines.join("\n")).toContain("KB written");
      expect(JSON.parse(h.lines[0] as string)).toEqual({
        manifest: { entity_counts: { tasks: 2 } },
        path: output,
      });
    });
  });

  it("restore --dry-run returns collisions and exits 0", async () => {
    const { runRestore } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runRestore(["--input", "/tmp/b.tar.gz", "--dry-run", "--json"], {
      readInput: async () => "dump",
      caller: {
        backup: {
          restore: async () => ({
            collisions: [{ kind: "tasks", id: "task-1" }],
            entity_counts: { tasks: 1 },
          }),
        },
      },
      ...h,
    });

    expect(h.exitCode).toBeUndefined();
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      collisions: [{ kind: "tasks", id: "task-1" }],
      entity_counts: { tasks: 1 },
    });
  });

  it("telemetry status --json returns opt-in status and row count", async () => {
    const { runTelemetry } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runTelemetry(["status", "--json"], {
      caller: {
        telemetry: {
          status: async () => ({ opted_in: false, row_count: 7 }),
        },
      },
      ...h,
    });

    expect(JSON.parse(h.lines[0] as string)).toEqual({ opted_in: false, row_count: 7 });
  });

  it("flags set validates rollout percent and emits requested shape", async () => {
    const { runFlags } = await import("../../src/cli/commands/flags.ts");
    const h = harness();

    await runFlags(["set", "my-feature", "--enabled", "--rollout-percent", "50", "--json"], {
      caller: {
        flags: {
          list: async () => [],
          set: async (input: { flag: string; enabled: boolean; rolloutPercent?: number }) => ({
            name: input.flag,
            enabled: input.enabled,
            rollout_percent: input.rolloutPercent,
          }),
        },
      },
      ...h,
    });

    expect(JSON.parse(h.lines[0] as string)).toEqual({
      name: "my-feature",
      enabled: true,
      rollout_percent: 50,
    });
  });

  it("data export blocks csv when import-csv/export-csv flag is disabled", async () => {
    const { runDataExport } = await import("../../src/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runDataExport(["--format", "csv", "--entity", "tasks", "--output", "/tmp/tasks.csv"], {
      caller: {
        flags: { list: async () => [{ name: "import-csv/export-csv", enabled: false }] },
        jsonImportExport: { create: async () => ({ json: "{}", entityCounts: {} }) },
      },
      ...h,
    });

    expect(h.exitCode).toBe(1);
    expect(h.errLines.join("\n")).toContain("Feature import-csv/export-csv not enabled");
  });
});
