import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runPlatformDoctorChecks, type PlatformDoctorCheck } from "@platform-core/application/platform-operations/readiness-checks.ts";
import { classifyLocalReadiness } from "@platform-core/infrastructure/application-database/doctor-checks.ts";

async function tempDir(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `fulcrum-platform-doctor-${name}-`));
}

function expectShape(check: PlatformDoctorCheck): void {
  expect(check.name.startsWith("platform.")).toBe(true);
  expect(["pass", "warn", "fail", "skip"]).toContain(check.status);
  expect(check.message.length).toBeGreaterThan(0);
  expect(check.recovery.length).toBeGreaterThan(0);
  expect(new Date(check.checked_at).toISOString()).toBe(check.checked_at);
}

describe("platform doctor checks", () => {
  test("local readiness classifier distinguishes pass, repairable, and reset-required", () => {
    expect(classifyLocalReadiness([
      { check: "db.migrationVersion", status: "pass", detail: "ok" },
    ])).toMatchObject({ status: "pass" });
    expect(classifyLocalReadiness([
      { check: "db.migrationVersion", status: "warn", detail: "missing", hint: "fulcrum db migrate" },
    ])).toMatchObject({ status: "repairable", repairCommand: "fulcrum db migrate" });
    expect(classifyLocalReadiness([
      { check: "db.canRunOnCurrentBinary", status: "fail", detail: "schema too new" },
    ])).toMatchObject({
      status: "reset-required",
      repairCommand: "fulcrum db reset-local-state --fulcrum-home <path> --yes-reset-local-state",
    });
  });

  test("theme check passes when tenant settings are readable and accent is HEX", async () => {
    const checks = await runPlatformDoctorChecks({
      theme: { readSettings: async () => ({ accent: "#4f46e5" }) },
    });
    const theme = checks.find((check) => check.name === "platform.theme")!;
    expectShape(theme);
    expect(theme.status).toBe("pass");
    expect(theme.message).toContain("#4f46e5");
  });

  test("theme check fails when accent is not parseable HEX", async () => {
    const checks = await runPlatformDoctorChecks({
      theme: { readSettings: async () => ({ accent: "blue" }) },
    });
    const theme = checks.find((check) => check.name === "platform.theme")!;
    expect(theme.status).toBe("fail");
    expect(theme.recovery).toContain("HEX");
  });

  test("secrets checks report keyring, fallback mode, and credential round-trip", async () => {
    const stateDir = await tempDir("secrets");
    try {
      const fallbackPath = join(stateDir, "keyring-fallback.key");
      await writeFile(fallbackPath, Buffer.alloc(32));
      await chmod(fallbackPath, 0o600);
      const checks = await runPlatformDoctorChecks({
        stateDir,
        keyring: {
          async resolve() {
            return { source: "fallback", fallbackPath };
          },
        },
        credentials: {
          metadataRegistered: true,
          async roundTrip() {
            return true;
          },
        },
      });

      const keyring = checks.find((check) => check.name === "platform.keyring")!;
      const mode = checks.find((check) => check.name === "platform.keyring_mode")!;
      const credentials = checks.find((check) => check.name === "platform.credentials")!;
      expect(keyring.status).toBe("pass");
      expect(mode.status).toBe("warn");
      expect(credentials.status).toBe("pass");
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  test("errors check fails when crashlog directory is not writable", async () => {
    const stateDir = await tempDir("errors");
    const crashlogDir = join(stateDir, "errors");
    try {
      await mkdir(crashlogDir, { recursive: true });
      await chmod(crashlogDir, 0o500);
      const checks = await runPlatformDoctorChecks({ crashlogDir });
      const crashlog = checks.find((check) => check.name === "platform.crashlog_dir")!;
      expect(crashlog.status).toBe("fail");
      expect(crashlog.recovery).toContain("writable");
    } finally {
      await chmod(crashlogDir, 0o700).catch(() => {});
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  test("backup check warns when last backup is older than seven days", async () => {
    const checks = await runPlatformDoctorChecks({
      backup: {
        lastRunAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        policyEnabled: true,
      },
    });
    const backup = checks.find((check) => check.name === "platform.backup_last_run")!;
    expect(backup.status).toBe("warn");
    expect(backup.message).toContain("older than 7 days");
  });

  test("telemetry check passes when opted_in has a value and fails when unset", async () => {
    const pass = await runPlatformDoctorChecks({ telemetry: { optedIn: false } });
    expect(pass.find((check) => check.name === "platform.telemetry")?.status).toBe("pass");

    const fail = await runPlatformDoctorChecks({ telemetry: { optedIn: null } });
    expect(fail.find((check) => check.name === "platform.telemetry")?.status).toBe("fail");
  });

  test("flags registry, experiment entity, i18n gate, and remote backup gate are checked", async () => {
    const checks = await runPlatformDoctorChecks({
      flags: {
        registeredFlags: ["router-llm", "scheduled-backups", "i18n"],
        experimentEntityRegistered: true,
        enabled: new Set(["i18n", "scheduled-backups"]),
      },
      i18n: { localeFiles: ["en.json", "de.json"], missingKeys: [] },
      remoteBackup: {
        dsn: "s3://bucket/path",
        async testPut() {
          return true;
        },
      },
    });

    expect(checks.find((check) => check.name === "platform.flags_registry")?.status).toBe("pass");
    expect(checks.find((check) => check.name === "platform.experiment_entity")?.status).toBe("pass");
    expect(checks.find((check) => check.name === "platform.i18n")?.status).toBe("pass");
    expect(checks.find((check) => check.name === "platform.remote_backup")?.status).toBe("pass");
  });

  test("i18n and remote backup are skipped when their flags are off", async () => {
    const checks = await runPlatformDoctorChecks({
      flags: { registeredFlags: ["router-llm"], experimentEntityRegistered: true, enabled: new Set() },
    });

    expect(checks.find((check) => check.name === "platform.i18n")?.status).toBe("skip");
    expect(checks.find((check) => check.name === "platform.remote_backup")?.status).toBe("skip");
  });

  test("doctor --json exposes platform checks and exits nonzero on platform failure", async () => {
    const home = await tempDir("cli");
    try {
      await writeFile(join(home, "theme.json"), JSON.stringify({ accent: "not-hex" }));
      const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "doctor", "--json"], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: home,
          FULCRUM_PLATFORM_THEME_SETTINGS: join(home, "theme.json"),
          FULCRUM_TELEMETRY_OPTED_IN: "true",
        },
      });
      const out = await new Response(proc.stdout).text();
      const code = await proc.exited;
      const report = JSON.parse(out) as { platformChecks: PlatformDoctorCheck[] };
      expect(code).toBe(1);
      expect(report.platformChecks.some((check) => check.name === "platform.theme" && check.status === "fail")).toBe(true);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
