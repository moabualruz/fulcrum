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
  it("i18n list --json returns supported locales and default locale", async () => {
    const { runI18n } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runI18n(["list", "--json"], h);

    expect(JSON.parse(h.lines[0] as string)).toEqual({
      locales: ["en", "fr", "ar"],
      defaultLocale: "en",
    });
  });

  it("i18n set --locale fr --json returns locale and text direction", async () => {
    const { runI18n } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runI18n(["set", "--locale", "fr", "--json"], h);

    expect(JSON.parse(h.lines[0] as string)).toEqual({ locale: "fr", dir: "ltr" });
  });

  it("theme list --json returns typed theme settings", async () => {
    const { runTheme } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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
    expect(JSON.parse(h.lines[0] as string)).toEqual([
      { key: "theme.accent", value: "#123456", defaultValue: "#6D28D9" },
    ]);
  });

  it("theme set --key theme.accent --value #2563EB --json returns updated setting", async () => {
    const { runTheme } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();
    let input: { key: string; value: string } | undefined;

    await runTheme(["set", "--key", "theme.accent", "--value", "#2563EB", "--json"], {
      caller: {
        theme: {
          setTheme: async (next: { key: string; value: string }) => {
            input = next;
            return { key: next.key, value: next.value, defaultValue: "#6D28D9" };
          },
        },
      },
      ...h,
    });

    expect(input).toEqual({ key: "theme.accent", value: "#2563EB" });
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      key: "theme.accent",
      value: "#2563EB",
      defaultValue: "#6D28D9",
    });
  });

  it("secrets set reads stdin and never prints secret value", async () => {
    const { runSecrets } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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

  it("secrets set --name --value returns metadata only", async () => {
    const { runSecrets } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runSecrets(["set", "--name", "API_KEY", "--value", "sk-live-secret", "--json"], {
      caller: {
        credentials: {
          set: async (input: { name: string; value: string }) => ({
            id: "cred-1",
            name: input.name,
            provider: "local",
            status: "stored",
          }),
        },
      },
      ...h,
    });

    expect(h.lines.join("\n")).not.toContain("sk-live-secret");
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      id: "cred-1",
      name: "API_KEY",
      provider: "local",
      status: "stored",
    });
  });

  it("secrets rotate --name returns provider status metadata only", async () => {
    const { runSecrets } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();

    await runSecrets(["rotate", "--name", "API_KEY", "--json"], {
      stdin: async () => "rotated-secret\n",
      caller: {
        credentials: {
          rotate: async (input: { name: string; value: string }) => ({
            name: input.name,
            provider: "local",
            status: "rotated",
          }),
        },
      },
      ...h,
    });

    expect(h.lines.join("\n")).not.toContain("rotated-secret");
    expect(JSON.parse(h.lines[0] as string)).toEqual({
      name: "API_KEY",
      provider: "local",
      status: "rotated",
    });
  });

  it("secrets get --json masks values by default", async () => {
    const { runSecrets } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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
    const { runErrors } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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

  it("error-logs get and purge emit JSON", async () => {
    const { runErrors } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const getHarness = harness();
    await runErrors(["get", "err-1", "--json"], {
      caller: {
        errorLogs: {
          get: async (input: { id: string }) => ({ id: input.id, errorMessage: "boom" }),
        },
      },
      ...getHarness,
    });

    expect(JSON.parse(getHarness.lines[0] as string)).toEqual({ id: "err-1", errorMessage: "boom" });

    const purgeHarness = harness();
    await runErrors(["purge", "--json"], {
      caller: {
        errorLogs: {
          clear: async () => ({ ok: true, deleted: 2 }),
        },
      },
      ...purgeHarness,
    });

    expect(JSON.parse(purgeHarness.lines[0] as string)).toEqual({ ok: true, deleted: 2 });
  });

  it("backup --output writes dump, reports progress on stderr, and emits manifest JSON", async () => {
    const { runBackup } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");

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

  it("backup create, restore --dump, and verify emit JSON parity payloads", async () => {
    const { runBackup } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const createHarness = harness();

    await runBackup(["create", "--json"], {
      caller: {
        backup: {
          create: async () => ({
            path: "/tmp/fulcrum.backup.gz",
            entityCounts: { tasks: 2 },
            checksumSha256: "abc123",
          }),
        },
      },
      ...createHarness,
    });

    expect(JSON.parse(createHarness.lines[0] as string)).toEqual({
      path: "/tmp/fulcrum.backup.gz",
      entityCounts: { tasks: 2 },
      checksumSha256: "abc123",
    });

    const restoreHarness = harness();
    await runBackup(["restore", "--dump", "base64-dump", "--dry-run", "--json"], {
      caller: {
        backup: {
          restore: async (input: { dump: string; dryRun: boolean }) => ({
            dryRun: input.dryRun,
            dump: input.dump,
            entityCounts: { tasks: 2 },
            collisions: [{ kind: "tasks", id: "task-1" }],
          }),
        },
      },
      ...restoreHarness,
    });

    expect(JSON.parse(restoreHarness.lines[0] as string)).toEqual({
      dryRun: true,
      dump: "base64-dump",
      entityCounts: { tasks: 2 },
      collisions: [{ kind: "tasks", id: "task-1" }],
    });

    const verifyHarness = harness();
    await runBackup(["verify", "--path", "/tmp/fulcrum.backup.gz", "--json"], {
      caller: {
        backup: {
          verify: async (input: { path: string }) => ({
            ok: true,
            path: input.path,
            format: "fulcrum.backup.v1",
            entityCounts: { tasks: 2 },
          }),
        },
      },
      ...verifyHarness,
    });

    expect(JSON.parse(verifyHarness.lines[0] as string)).toEqual({
      ok: true,
      path: "/tmp/fulcrum.backup.gz",
      format: "fulcrum.backup.v1",
      entityCounts: { tasks: 2 },
    });
  });

  it("restore --dry-run returns collisions and exits 0", async () => {
    const { runRestore } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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
    const { runTelemetry } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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

  it("telemetry opt-in, opt-out, and purge emit JSON", async () => {
    const { runTelemetry } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
    const h = harness();
    const calls: string[] = [];

    for (const argv of [["opt-in", "--json"], ["opt-out", "--json"], ["purge", "--json"]] as const) {
      await runTelemetry(argv, {
        caller: {
          telemetry: {
            optIn: async () => { calls.push("opt-in"); return { ok: true }; },
            optOut: async () => { calls.push("opt-out"); return { ok: true }; },
            purge: async () => { calls.push("purge"); return { ok: true, deleted: 3 }; },
          },
        },
        ...h,
      });
    }

    expect(calls).toEqual(["opt-in", "opt-out", "purge"]);
    expect(h.lines.map((line) => JSON.parse(line))).toEqual([{ ok: true }, { ok: true }, { ok: true, deleted: 3 }]);
  });

  it("flags set validates rollout percent and emits requested shape", async () => {
    const { runFlags } = await import("@fulcrum/cli/commands/flags.ts");
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
    const { runDataExport } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");
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

  it("data export and import commands emit JSON with entity counts", async () => {
    const { runDataExport, runDataImport } = await import("@fulcrum/cli/commands/cross-cutting-platform.ts");

    await withTempDir(async (dir) => {
      const exportHarness = harness();
      const jsonOutput = join(dir, "fulcrum-export.json");
      await runDataExport(["--format", "json", "--output", jsonOutput, "--json"], {
        caller: {
          dataExport: {
            create: async () => ({ json: "{\"format\":\"fulcrum.json-export.v1\"}", entityCounts: { tasks: 2 } }),
          },
        },
        ...exportHarness,
      });
      expect(JSON.parse(exportHarness.lines[0] as string)).toEqual({
        path: jsonOutput,
        entityCounts: { tasks: 2 },
        format: "json",
      });

      const csvHarness = harness();
      const csvOutput = join(dir, "tasks.csv");
      await runDataExport(["--format", "csv", "--entity", "tasks", "--output", csvOutput, "--json"], {
        caller: {
          flags: { list: async () => [{ name: "import-csv/export-csv", enabled: true }] },
          dataExport: {
            create: async () => ({ json: "id,title\n1,Task", entityCounts: { tasks: 1 } }),
          },
        },
        ...csvHarness,
      });
      expect(JSON.parse(csvHarness.lines[0] as string)).toEqual({
        path: csvOutput,
        entityCounts: { tasks: 1 },
        format: "csv",
      });

      const preflightHarness = harness();
      await runDataImport(["preflight", "--path", jsonOutput, "--json"], {
        caller: {
          dataImport: {
            preflight: async (input: { path: string }) => ({
              importId: input.path,
              counts: { tasks: 2 },
              collisions: [{ kind: "tasks", id: "task-1" }],
            }),
          },
        },
        ...preflightHarness,
      });
      expect(JSON.parse(preflightHarness.lines[0] as string)).toEqual({
        importId: jsonOutput,
        counts: { tasks: 2 },
        collisions: [{ kind: "tasks", id: "task-1" }],
      });

      const runHarness = harness();
      await runDataImport(["run", "--import-id", jsonOutput, "--dry-run", "--json"], {
        caller: {
          dataImport: {
            run: async (input: { importId: string; dryRun: boolean }) => ({
              importId: input.importId,
              dryRun: input.dryRun,
              imported: 0,
              updated: 0,
              skipped: 0,
              errors: 0,
              counts: { tasks: 2 },
            }),
          },
        },
        ...runHarness,
      });
      expect(JSON.parse(runHarness.lines[0] as string)).toEqual({
        importId: jsonOutput,
        dryRun: true,
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        counts: { tasks: 2 },
      });
    });
  });
});
