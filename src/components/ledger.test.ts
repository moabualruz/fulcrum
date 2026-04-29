import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { ComponentLedger } from "./ledger.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-component-ledger-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("ComponentLedger", () => {
  test("creates v1 components columns in plan order", () => {
    const ledger = ComponentLedger.open();
    const db = new Database(join(scratch, "state", "global", "components.db"), { readonly: true });
    const columns = tableColumns(db, "components");

    expect(columns).toEqual([
      { name: "id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "kind", type: "TEXT", notnull: 1, pk: 0 },
      { name: "version", type: "TEXT", notnull: 0, pk: 0 },
      { name: "installed_at", type: "TEXT", notnull: 0, pk: 0 },
      { name: "updated_at", type: "TEXT", notnull: 0, pk: 0 },
      { name: "status", type: "TEXT", notnull: 1, pk: 0 },
    ]);
    db.close();
    ledger.close();
  });

  test("creates v1 artifacts columns in plan order", () => {
    const ledger = ComponentLedger.open();
    const db = new Database(join(scratch, "state", "global", "components.db"), { readonly: true });
    const columns = tableColumns(db, "artifacts");

    expect(columns).toEqual([
      { name: "surface_id", type: "TEXT", notnull: 1, pk: 1 },
      { name: "path", type: "TEXT", notnull: 1, pk: 2 },
      { name: "sha256", type: "TEXT", notnull: 0, pk: 0 },
      { name: "size", type: "INTEGER", notnull: 0, pk: 0 },
      { name: "modified", type: "INTEGER", notnull: 1, pk: 0 },
      { name: "last_seen_at", type: "TEXT", notnull: 1, pk: 0 },
    ]);
    db.close();
    ledger.close();
  });

  test("creates v1 surfaces columns in plan order", () => {
    const ledger = ComponentLedger.open();
    const db = new Database(join(scratch, "state", "global", "components.db"), { readonly: true });
    const columns = tableColumns(db, "surfaces");

    expect(columns).toEqual([
      { name: "id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "component_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "agent_id", type: "TEXT", notnull: 0, pk: 0 },
      { name: "kind", type: "TEXT", notnull: 1, pk: 0 },
      { name: "target", type: "TEXT", notnull: 1, pk: 0 },
      { name: "owner_key", type: "TEXT", notnull: 1, pk: 0 },
      { name: "desired_enabled", type: "INTEGER", notnull: 0, pk: 0 },
      { name: "remove_policy", type: "TEXT", notnull: 1, pk: 0 },
      { name: "updated_at", type: "TEXT", notnull: 1, pk: 0 },
    ]);
    db.close();
    ledger.close();
  });

  test("creates v1 operations columns in plan order", () => {
    const ledger = ComponentLedger.open();
    const db = new Database(join(scratch, "state", "global", "components.db"), { readonly: true });
    const columns = tableColumns(db, "operations");

    expect(columns).toEqual([
      { name: "id", type: "TEXT", notnull: 0, pk: 1 },
      { name: "command", type: "TEXT", notnull: 1, pk: 0 },
      { name: "target", type: "TEXT", notnull: 1, pk: 0 },
      { name: "started_at", type: "TEXT", notnull: 1, pk: 0 },
      { name: "ended_at", type: "TEXT", notnull: 0, pk: 0 },
      { name: "status", type: "TEXT", notnull: 1, pk: 0 },
    ]);
    db.close();
    ledger.close();
  });

  test("creates v1 operation_steps columns in plan order", () => {
    const ledger = ComponentLedger.open();
    const db = new Database(join(scratch, "state", "global", "components.db"), { readonly: true });
    const columns = tableColumns(db, "operation_steps");

    expect(columns).toEqual([
      { name: "operation_id", type: "TEXT", notnull: 1, pk: 1 },
      { name: "action_id", type: "TEXT", notnull: 1, pk: 2 },
      { name: "component_id", type: "TEXT", notnull: 1, pk: 0 },
      { name: "agent_id", type: "TEXT", notnull: 0, pk: 0 },
      { name: "action", type: "TEXT", notnull: 1, pk: 0 },
      { name: "status", type: "TEXT", notnull: 1, pk: 0 },
      { name: "error", type: "TEXT", notnull: 0, pk: 0 },
      { name: "started_at", type: "TEXT", notnull: 1, pk: 0 },
      { name: "ended_at", type: "TEXT", notnull: 0, pk: 0 },
    ]);
    db.close();
    ledger.close();
  });

  test("initializes schema version 1", () => {
    const ledger = ComponentLedger.open();
    expect(ledger.userVersion()).toBe(1);
    ledger.close();
  });

  test("records component and surface state", () => {
    const ledger = ComponentLedger.open();
    ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
    ledger.recordSurface({
      id: "hooks.format:codex",
      componentId: "hooks.format",
      agentId: "codex",
      kind: "hook-registration",
      target: "~/.codex/hooks.json",
      ownerKey: "fulcrum:hook:format",
      desiredEnabled: true,
      removePolicy: "managed-only",
    });
    expect(ledger.componentStatus("hooks.format")?.status).toBe("installed");
    expect(ledger.surfacesForComponent("hooks.format")).toHaveLength(1);
    ledger.close();
  });

  test("records operation steps", () => {
    const ledger = ComponentLedger.open();
    const operationId = ledger.beginOperation("install", "hooks.format");
    ledger.recordOperationStep({
      operationId,
      actionId: "a1",
      componentId: "hooks.format",
      agentId: "codex",
      action: "create-or-update",
      status: "ok",
    });
    ledger.endOperation(operationId, "ok");
    expect(ledger.operationSteps(operationId)[0]?.status).toBe("ok");
    ledger.close();
  });

  test("updates component status without clearing installed_at", () => {
    const ledger = ComponentLedger.open();
    ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
    ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "missing" });

    const dbPath = join(scratch, "state", "global", "components.db");
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .query<{ installed_at: string | null }, []>(
        "SELECT installed_at FROM components WHERE id = 'hooks.format'",
      )
      .get();
    db.close();

    expect(ledger.componentStatus("hooks.format")?.status).toBe("missing");
    expect(row?.installed_at).not.toBeNull();
    ledger.close();
  });

  test("persists desiredEnabled as 1, 0, and null while upserting surfaces", () => {
    const ledger = ComponentLedger.open();
    ledger.recordSurface({
      id: "hooks.format:codex",
      componentId: "hooks.format",
      agentId: "codex",
      kind: "hook-registration",
      target: "~/.codex/hooks.json",
      ownerKey: "fulcrum:hook:format",
      desiredEnabled: true,
      removePolicy: "managed-only",
    });
    ledger.recordSurface({
      id: "hooks.format:codex",
      componentId: "hooks.format",
      agentId: "codex",
      kind: "hook-registration",
      target: "~/.codex/settings.json",
      ownerKey: "fulcrum:hook:format",
      desiredEnabled: false,
      removePolicy: "managed-only",
    });
    ledger.recordSurface({
      id: "hooks.lint:codex",
      componentId: "hooks.lint",
      kind: "hook-registration",
      target: "~/.codex/hooks.json",
      ownerKey: "fulcrum:hook:lint",
      removePolicy: "managed-only",
    });

    const dbPath = join(scratch, "state", "global", "components.db");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .query<{ id: string; desired_enabled: number | null; target: string }, []>(
        "SELECT id, desired_enabled, target FROM surfaces ORDER BY id",
      )
      .all();
    db.close();

    expect(rows).toEqual([
      {
        id: "hooks.format:codex",
        desired_enabled: 0,
        target: "~/.codex/settings.json",
      },
      {
        id: "hooks.lint:codex",
        desired_enabled: null,
        target: "~/.codex/hooks.json",
      },
    ]);
    ledger.close();
  });

  test("opens custom path by creating nested parent directories", () => {
    const customPath = join(scratch, "nested", "ledger", "components.db");
    const ledger = ComponentLedger.open(customPath);

    expect(existsSync(dirname(customPath))).toBe(true);
    expect(existsSync(customPath)).toBe(true);
    expect(ledger.userVersion()).toBe(1);
    ledger.close();
  });

  test("orders operation steps by action_id", () => {
    const ledger = ComponentLedger.open();
    const operationId = ledger.beginOperation("install", "hooks.format");
    ledger.recordOperationStep({
      operationId,
      actionId: "b",
      componentId: "hooks.format",
      action: "create-or-update",
      status: "ok",
    });
    ledger.recordOperationStep({
      operationId,
      actionId: "a",
      componentId: "hooks.format",
      action: "create-or-update",
      status: "pending",
    });

    expect(ledger.operationSteps(operationId)).toEqual([
      { action_id: "a", status: "pending" },
      { action_id: "b", status: "ok" },
    ]);
    ledger.close();
  });
});

type TableColumn = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

function tableColumns(db: Database, tableName: string): TableColumn[] {
  return db
    .query<TableColumn, []>(`PRAGMA table_info(${tableName})`)
    .all()
    .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
}
