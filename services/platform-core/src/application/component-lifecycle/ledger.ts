import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

type ComponentStatus = {
  id: string;
  kind: string;
  status: string;
};

type SurfaceRow = {
  id: string;
  component_id: string;
  agent_id: string | null;
  kind: string;
  target: string;
};

type OperationStepRow = {
  action_id: string;
  status: string;
};

export function dbPath(): string {
  return join(process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum"), "state", "global", "components.db");
}

export class ComponentLedger {
  static open(path = dbPath()): ComponentLedger {
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    migrate(db);
    return new ComponentLedger(db);
  }

  private constructor(private readonly db: Database) {}

  close(): void {
    this.db.close();
  }

  userVersion(): number {
    const row = this.db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    return row?.user_version ?? 0;
  }

  recordComponent(input: { id: string; kind: string; status: string; version?: string }): void {
    this.db
      .query(
        `INSERT INTO components (id, kind, status, version, installed_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           status = excluded.status,
           version = excluded.version,
           updated_at = datetime('now')`,
      )
      .run(input.id, input.kind, input.status, input.version ?? null);
  }

  componentStatus(id: string): ComponentStatus | null {
    return (
      this.db
        .query<ComponentStatus, [string]>("SELECT id, kind, status FROM components WHERE id = ?")
        .get(id) ?? null
    );
  }

  recordSurface(input: {
    id: string;
    componentId: string;
    agentId?: string;
    kind: string;
    target: string;
    ownerKey: string;
    desiredEnabled?: boolean;
    removePolicy: string;
  }): void {
    const desiredEnabled = input.desiredEnabled === undefined ? null : input.desiredEnabled ? 1 : 0;
    this.db
      .query(
        `INSERT INTO surfaces (
           id,
           component_id,
           agent_id,
           kind,
           target,
           owner_key,
           desired_enabled,
           remove_policy,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           component_id = excluded.component_id,
           agent_id = excluded.agent_id,
           kind = excluded.kind,
           target = excluded.target,
           owner_key = excluded.owner_key,
           desired_enabled = excluded.desired_enabled,
           remove_policy = excluded.remove_policy,
           updated_at = datetime('now')`,
      )
      .run(
        input.id,
        input.componentId,
        input.agentId ?? null,
        input.kind,
        input.target,
        input.ownerKey,
        desiredEnabled,
        input.removePolicy,
      );
  }

  surfacesForComponent(componentId: string): SurfaceRow[] {
    return this.db
      .query<SurfaceRow, [string]>(
        `SELECT id, component_id, agent_id, kind, target
         FROM surfaces
         WHERE component_id = ?
         ORDER BY id`,
      )
      .all(componentId);
  }

  beginOperation(command: string, target: string): string {
    const id = `${new Date().toISOString()}-${randomUUID().slice(0, 12)}`;
    this.db
      .query(
        `INSERT INTO operations (id, command, target, status, started_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(id, command, target, "running");
    return id;
  }

  endOperation(id: string, status: string): void {
    this.db
      .query(
        `UPDATE operations
         SET status = ?, ended_at = datetime('now')
         WHERE id = ?`,
      )
      .run(status, id);
  }

  recordOperationStep(input: {
    operationId: string;
    actionId: string;
    componentId: string;
    agentId?: string;
    action: string;
    status: string;
    error?: string;
  }): void {
    this.db
      .query(
        `INSERT INTO operation_steps (
           operation_id,
           action_id,
           component_id,
           agent_id,
           action,
           status,
           error,
           started_at,
           ended_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(operation_id, action_id) DO UPDATE SET
           component_id = excluded.component_id,
           agent_id = excluded.agent_id,
           action = excluded.action,
           status = excluded.status,
           error = excluded.error,
           started_at = excluded.started_at,
           ended_at = excluded.ended_at`,
      )
      .run(
        input.operationId,
        input.actionId,
        input.componentId ?? null,
        input.agentId ?? null,
        input.action,
        input.status,
        input.error ?? null,
      );
  }

  operationSteps(operationId: string): OperationStepRow[] {
    return this.db
      .query<OperationStepRow, [string]>(
        `SELECT action_id, status
         FROM operation_steps
         WHERE operation_id = ?
         ORDER BY action_id`,
      )
      .all(operationId);
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      version TEXT,
      installed_at TEXT,
      updated_at TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS surfaces (
      id TEXT PRIMARY KEY,
      component_id TEXT NOT NULL,
      agent_id TEXT,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      desired_enabled INTEGER,
      remove_policy TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      surface_id TEXT NOT NULL,
      path TEXT NOT NULL,
      sha256 TEXT,
      size INTEGER,
      modified INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (surface_id, path)
    );

    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      target TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operation_steps (
      operation_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      component_id TEXT NOT NULL,
      agent_id TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      PRIMARY KEY (operation_id, action_id)
    );

    PRAGMA user_version = 1;
  `);
}
