import { describe, expect, it } from "bun:test";

import {
  MAX_KNOWN_MIGRATION_VERSION,
  classifyLocalReadiness,
  dbCanRunOnCurrentBinary,
  dbMigrationVersion,
  type DoctorCheckResult,
} from "../../src/db/doctor-checks.ts";

function repoWithRows(rows: Array<{ version: number; name: string; direction: string }>) {
  return {
    findAll: async (opts: { orderBy: { version: "DESC" }; limit: number }) => {
      expect(opts).toEqual({ orderBy: { version: "DESC" }, limit: 1 });
      return rows;
    },
  };
}

describe("db doctor checks", () => {
  it("classifies fail, warn, and pass readiness with repair commands", () => {
    const fail: DoctorCheckResult = { check: "db.future", status: "fail", detail: "future schema" };
    const warn: DoctorCheckResult = {
      check: "db.migrationVersion",
      status: "warn",
      detail: "No migrations applied yet.",
      hint: "fulcrum db migrate",
    };
    const pass: DoctorCheckResult = { check: "db.ok", status: "pass", detail: "ok" };

    expect(classifyLocalReadiness([pass, fail])).toMatchObject({
      status: "reset-required",
      check: "db.future",
      repairCommand: "fulcrum db reset-local-state --fulcrum-home <path> --yes-reset-local-state",
    });
    expect(classifyLocalReadiness([pass, warn])).toEqual({
      status: "repairable",
      check: "db.migrationVersion",
      detail: "No migrations applied yet.",
      repairCommand: "fulcrum db migrate",
    });
    expect(classifyLocalReadiness([pass])).toEqual({
      status: "pass",
      check: "local.readiness",
      detail: "Local database readiness checks passed.",
    });
  });

  it("reports migration version warnings and latest applied migration details", async () => {
    await expect(dbMigrationVersion(repoWithRows([]) as never)).resolves.toEqual({
      check: "db.migrationVersion",
      status: "warn",
      detail: "No migrations applied yet.",
      hint: "Run `fulcrum db migrate` to apply all pending migrations.",
    });

    await expect(
      dbMigrationVersion(repoWithRows([{ version: 20260506095000, name: "phase95", direction: "up" }]) as never),
    ).resolves.toEqual({
      check: "db.migrationVersion",
      status: "pass",
      detail: "Current migration: v20260506095000 — phase95 (direction: up)",
    });
  });

  it("blocks binaries older than the applied database schema", async () => {
    await expect(dbCanRunOnCurrentBinary(repoWithRows([]) as never)).resolves.toEqual({
      check: "db.canRunOnCurrentBinary",
      status: "pass",
      detail: "No migrations applied; no version conflict.",
    });

    await expect(
      dbCanRunOnCurrentBinary(repoWithRows([{ version: MAX_KNOWN_MIGRATION_VERSION, name: "current", direction: "up" }]) as never),
    ).resolves.toEqual({
      check: "db.canRunOnCurrentBinary",
      status: "pass",
      detail: `DB schema v${MAX_KNOWN_MIGRATION_VERSION} ≤ binary max v${MAX_KNOWN_MIGRATION_VERSION}. OK.`,
    });

    await expect(
      dbCanRunOnCurrentBinary(repoWithRows([{ version: MAX_KNOWN_MIGRATION_VERSION + 1, name: "future", direction: "up" }]) as never),
    ).resolves.toMatchObject({
      check: "db.canRunOnCurrentBinary",
      status: "fail",
      hint: expect.stringContaining("Upgrade the fulcrum binary"),
    });
  });
});
