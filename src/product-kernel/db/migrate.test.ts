import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "./pglite.ts";
import { runMigrations } from "./migrate.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-migrate-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

const REQUIRED_TABLES = [
  "orgs",
  "projects",
  "repos",
  "documents",
  "tasks",
  "memories",
  "agent_runs",
  "artifacts",
  "edges",
  "events",
  "search_documents",
  "jobs",
  "org_settings",
  "github_prs",
  "github_issues",
  "repo_branches",
] as const;

async function tableExists(
  db: Awaited<ReturnType<typeof openPglite>>,
  name: string,
): Promise<boolean> {
  const rows = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
    [name],
  );
  return (rows[0]?.count ?? 0) > 0;
}

async function columnNames(
  db: Awaited<ReturnType<typeof openPglite>>,
  table: string,
): Promise<Set<string>> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = $1`,
    [table],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function indexNames(
  db: Awaited<ReturnType<typeof openPglite>>,
  table: string,
): Promise<Set<string>> {
  const rows = await db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE tablename = $1`,
    [table],
  );
  return new Set(rows.map((row) => row.indexname));
}

describe("product kernel migrations", () => {
  test("creates the required tables on a fresh database", async () => {
    const db = await openPglite(join(scratch, "fresh"));
    try {
      const applied = await runMigrations(db);
      expect(applied.length).toBeGreaterThanOrEqual(4);
      for (const name of REQUIRED_TABLES) {
        expect(await tableExists(db, name)).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("is idempotent on re-run", async () => {
    const db = await openPglite(join(scratch, "idem"));
    try {
      await runMigrations(db);
      const second = await runMigrations(db);
      expect(second).toEqual([]);
      for (const name of REQUIRED_TABLES) {
        expect(await tableExists(db, name)).toBe(true);
      }
    } finally {
      await db.close();
    }
  });

  test("populates search_documents.search_vector via the generated tsvector column", async () => {
    const db = await openPglite(join(scratch, "fts"));
    try {
      await runMigrations(db);
      await db.query(
        `INSERT INTO search_documents (id, org_id, source_kind, source_id, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["s1", "o1", "task", "t1", "find product kernel", "kernel body"],
      );
      const rows = await db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM search_documents
         WHERE search_vector @@ plainto_tsquery('english', $1)`,
        ["kernel"],
      );
      expect(rows[0]?.count ?? 0).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("upgrades an old baseline-applied database with agent_runs retry/stall columns", async () => {
    const db = await openPglite(join(scratch, "old-baseline-upgrade"));
    try {
      await db.exec(`
        CREATE TABLE schema_migrations (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE projects (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          name text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE agent_runs (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          project_id text,
          task_id text,
          agent text NOT NULL,
          model text,
          prompt text,
          status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
          exit_code integer,
          transcript_path text,
          total_tokens integer,
          cost_usd numeric,
          parent_run_id text REFERENCES agent_runs(id),
          started_at timestamptz NOT NULL DEFAULT now(),
          ended_at timestamptz
        );

        CREATE TABLE artifacts (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          project_id text,
          run_id text,
          task_id text,
          kind text NOT NULL DEFAULT 'file',
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE search_documents (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          source_kind text NOT NULL,
          source_id text NOT NULL,
          title text,
          body text,
          indexed_at timestamptz NOT NULL DEFAULT now()
        );

        INSERT INTO schema_migrations (name) VALUES
          ('0001_product_kernel.sql'),
          ('0002_search.sql'),
          ('0003_jobs.sql'),
          ('0005_artifacts.sql'),
          ('0006_search_extended.sql');
      `);

      const applied = await runMigrations(db);
      expect(applied).toContain("0004_agent_runs_retry_stall.sql");

      const columns = await columnNames(db, "agent_runs");
      expect(columns).toContain("orchestration_state");
      expect(columns).toContain("attempt_count");
      expect(columns).toContain("next_retry_at");
      expect(columns).toContain("last_error_kind");

      const indexes = await indexNames(db, "agent_runs");
      expect(indexes).toContain("agent_runs_dispatch_poll");
      expect(indexes).toContain("agent_runs_stall_scan");

      await expect(
        db.query(
          `INSERT INTO agent_runs (id, org_id, agent, status, orchestration_state)
           VALUES ($1, $2, $3, $4, $5)`,
          ["r1", "o1", "codex", "running", "not-a-state"],
        ),
      ).rejects.toThrow();
    } finally {
      await db.close();
    }
  });
});
