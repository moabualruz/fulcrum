/**
 * TDD — Artifact + Edge schema for Sandcastle artifact harvest.
 *
 * RED target: sandbox Artifact/Edge entities and their migration do not exist.
 * GREEN target: migration applies, four required indexes exist, and both
 * repositories round-trip through MikroORM findOne().
 *
 * Closes (issue): .scratch/agent-os-vision/04-sandcastle-wrapper/issues/03-artifacts-edges-migration.md
 */

import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { ReferenceKind } from "@mikro-orm/postgresql";

import { createTestOrm } from "../../../src/test-utils/db.ts";
import { DEFAULT_ORG_ID } from "../../../src/db/seed.ts";
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";

const MIGRATION_NAME = "Migration20260502070500_artifacts_edges";
const PREVIOUS_MIGRATION_NAME = "Migration20260502070400_agent_runs_sandcastle_columns";

async function loadSandboxEntities() {
  const [artifactModule, compatArtifactModule, edgeModule] = await Promise.all([
    import("../../../src/db/entities/sandbox/Artifact.ts").catch(() => undefined),
    import("../../../src/db/entities/artifacts/Artifact.ts").catch(() => undefined),
    import("../../../src/db/entities/sandbox/Edge.ts").catch(() => undefined),
  ]);

  expect(artifactModule).toBeDefined();
  expect(compatArtifactModule).toBeDefined();
  expect(edgeModule).toBeDefined();
  expect(compatArtifactModule!.Artifact).toBe(artifactModule!.Artifact);

  return {
    Artifact: artifactModule!.Artifact,
    Edge: edgeModule!.Edge,
  };
}

async function indexRows(
  db: Awaited<ReturnType<typeof createTestOrm>>,
  names: readonly string[],
) {
  const quoted = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
  const rows = await db.pglite.query<{ indexname: string; indexdef: string }>(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and indexname in (${quoted})
    order by indexname
  `);
  return rows.rows;
}

async function foreignKeyRows(
  db: Awaited<ReturnType<typeof createTestOrm>>,
  names: readonly string[],
) {
  const quoted = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
  const rows = await db.pglite.query<{ conname: string; confdeltype: string }>(`
    select conname, confdeltype
    from pg_constraint
    where conname in (${quoted})
    order by conname
  `);
  return rows.rows;
}

describe("Artifact + Edge sandbox schema", () => {
  it("declares artifact and edge properties with org-scoped indexes", async () => {
    const { Artifact, Edge } = await loadSandboxEntities();
    const db = await createTestOrm();
    try {
      const artifactMeta = db.orm.getMetadata().get(Artifact);
      const edgeMeta = db.orm.getMetadata().get(Edge);

      expect(artifactMeta.tableName).toBe("artifacts");
      expect(artifactMeta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect((artifactMeta.properties["org"] as { deleteRule?: string })?.deleteRule)
        .toBe("cascade");
      expect(artifactMeta.properties["run"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(artifactMeta.properties["run"]?.fieldNames).toEqual(["run_id"]);
      expect((artifactMeta.properties["run"] as { deleteRule?: string })?.deleteRule)
        .toBe("cascade");
      expect(artifactMeta.properties["task"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(artifactMeta.properties["task"]?.nullable).toBe(true);
      expect(artifactMeta.properties["task"]?.fieldNames).toEqual(["task_id"]);
      expect((artifactMeta.properties["task"] as { deleteRule?: string })?.deleteRule)
        .toBe("set null");
      expect(artifactMeta.properties["filename"]?.fieldNames).toEqual(["filename"]);
      expect(artifactMeta.properties["mime"]?.nullable).toBe(true);
      expect(artifactMeta.properties["sizeBytes"]?.fieldNames).toEqual(["size_bytes"]);
      expect(artifactMeta.properties["path"]?.fieldNames).toEqual(["path"]);
      expect(artifactMeta.properties["metadataJson"]?.fieldNames).toEqual(["metadata_json"]);
      expect(artifactMeta.properties["metadataJson"]?.nullable).toBe(true);
      expect(artifactMeta.properties["createdAt"]?.fieldNames).toEqual(["created_at"]);
      expect(artifactMeta.indexes?.some((idx) => idx.name === "artifacts_org_run")).toBe(true);
      expect(artifactMeta.indexes?.some((idx) => idx.name === "artifacts_org_task")).toBe(true);

      expect(edgeMeta.tableName).toBe("edges");
      const edgeProperties = edgeMeta.properties as Record<string, { fieldNames?: string[] }>;
      expect((edgeMeta.properties["org"] as { deleteRule?: string })?.deleteRule)
        .toBe("cascade");
      for (const [property, fieldName] of Object.entries({
        org: "org_id",
        fromKind: "from_kind",
        fromId: "from_id",
        toKind: "to_kind",
        toId: "to_id",
        kind: "kind",
        createdAt: "created_at",
      })) {
        expect(edgeProperties[property]?.fieldNames).toEqual([fieldName]);
      }
      const unique = edgeMeta.uniques?.find((idx) => idx.name === "edges_from_to_kind");
      expect(unique).toBeDefined();
      expect(edgeMeta.indexes?.some((idx) => idx.name === "edges_to_lookup")).toBe(true);
    } finally {
      await db.close();
    }
  });

  it("applies migration, exposes required indexes, and round-trips repositories", async () => {
    const { Artifact, Edge } = await loadSandboxEntities();
    const db = await createTestOrm();
    try {
      const rows = await indexRows(db, [
        "artifacts_org_run",
        "artifacts_org_task",
        "artifacts_run_fk",
        "artifacts_task_fk",
        "edges_from_to_kind",
        "edges_to_lookup",
      ]);
      expect(rows.map((row) => row.indexname)).toEqual([
        "artifacts_org_run",
        "artifacts_org_task",
        "artifacts_run_fk",
        "artifacts_task_fk",
        "edges_from_to_kind",
        "edges_to_lookup",
      ]);
      expect(rows.find((row) => row.indexname === "edges_from_to_kind")?.indexdef)
        .toContain("UNIQUE");

      const fks = await foreignKeyRows(db, [
        "artifacts_org_id_foreign",
        "artifacts_run_id_foreign",
        "artifacts_task_id_foreign",
        "edges_org_id_foreign",
      ]);
      expect(fks).toEqual([
        { conname: "artifacts_org_id_foreign", confdeltype: "c" },
        { conname: "artifacts_run_id_foreign", confdeltype: "c" },
        { conname: "artifacts_task_id_foreign", confdeltype: "n" },
        { conname: "edges_org_id_foreign", confdeltype: "c" },
      ]);

      const em = db.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const task = em.create(Task, {
        id: randomUUID(),
        org,
        createdAt: new Date(),
        blockedByIds: [],
        status: "ready",
        priority: 1,
      });
      const run = em.create(AgentRun, {
        id: randomUUID(),
        org,
        task,
        status: "succeeded",
        agentName: "codex",
      });
      const artifact = em.create(Artifact, {
        id: randomUUID(),
        org,
        run,
        task,
        filename: "run.diff",
        mime: "text/x-diff",
        sizeBytes: 128n,
        path: "artifacts/run.diff",
        metadataJson: { providerId: "sandcastle-file-1" },
      });
      const edge = em.create(Edge, {
        org,
        fromKind: "artifact",
        fromId: artifact.id,
        toKind: "agent_run",
        toId: run.id,
        kind: "generated_by",
      });

      em.persist([task, run, artifact, edge]);
      await em.flush();
      em.clear();

      const savedArtifact = await em.getRepository(Artifact).findOne({ id: artifact.id });
      const savedEdge = await em.getRepository(Edge).findOne({ id: edge.id });

      expect(savedArtifact?.filename).toBe("run.diff");
      expect(savedArtifact?.run?.id).toBe(run.id);
      expect(savedArtifact?.task?.id).toBe(task.id);
      expect(savedArtifact?.metadataJson).toEqual({ providerId: "sandcastle-file-1" });
      expect(savedEdge?.fromKind).toBe("artifact");
      expect(savedEdge?.toKind).toBe("agent_run");
      expect(savedEdge?.kind).toBe("generated_by");
    } finally {
      await db.close();
    }
  });

  it("rejects duplicate edge rows at the database layer", async () => {
    const db = await createTestOrm();
    try {
      const fromId = randomUUID();
      const toId = randomUUID();
      await db.pglite.query(
        `
          insert into edges (org_id, from_kind, from_id, to_kind, to_id, kind)
          values ($1, 'artifact', $2, 'agent_run', $3, 'generated_by')
        `,
        [DEFAULT_ORG_ID, fromId, toId],
      );

      await expect(db.pglite.query(
        `
          insert into edges (org_id, from_kind, from_id, to_kind, to_id, kind)
          values ($1, 'artifact', $2, 'agent_run', $3, 'generated_by')
        `,
        [DEFAULT_ORG_ID, fromId, toId],
      )).rejects.toThrow(/duplicate|unique/i);
    } finally {
      await db.close();
    }
  });

  it("enforces artifact and edge delete rules at the database layer", async () => {
    const { Artifact, Edge } = await loadSandboxEntities();
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const org = em.create(Org, {
        id: randomUUID(),
        name: "Delete Rule Org",
        slug: `delete-rule-${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const task = em.create(Task, {
        id: randomUUID(),
        org,
        createdAt: new Date(),
        blockedByIds: [],
        status: "ready",
        priority: 1,
      });
      const run = em.create(AgentRun, {
        id: randomUUID(),
        org,
        status: "succeeded",
        agentName: "codex",
      });
      const artifact = em.create(Artifact, {
        id: randomUUID(),
        org,
        run,
        task,
        filename: "delete-rule.txt",
        path: "artifacts/delete-rule.txt",
      });
      const edge = em.create(Edge, {
        org,
        fromKind: "artifact",
        fromId: artifact.id,
        toKind: "agent_run",
        toId: run.id,
        kind: "generated_by",
      });

      em.persist([org, task, run, artifact, edge]);
      await em.flush();

      await db.pglite.query(`delete from tasks where id = $1`, [task.id]);
      const taskRows = await db.pglite.query<{ task_id: string | null }>(
        `select task_id from artifacts where id = $1`,
        [artifact.id],
      );
      expect(taskRows.rows).toEqual([{ task_id: null }]);

      await db.pglite.query(`delete from agent_runs where id = $1`, [run.id]);
      const artifactRows = await db.pglite.query<{ id: string }>(
        `select id from artifacts where id = $1`,
        [artifact.id],
      );
      expect(artifactRows.rows).toEqual([]);

      const intermediateEdgeRows = await db.pglite.query<{ id: string }>(
        `select id from edges where id = $1`,
        [edge.id],
      );
      expect(intermediateEdgeRows.rows).toEqual([{ id: edge.id }]);

      await db.pglite.query(`delete from orgs where id = $1`, [org.id]);
      const edgeRows = await db.pglite.query<{ id: string }>(
        `select id from edges where id = $1`,
        [edge.id],
      );
      expect(edgeRows.rows).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it("backfills existing stub artifact rows before enforcing required columns", async () => {
    const db = await createTestOrm();
    try {
      await db.orm.migrator.down({ to: PREVIOUS_MIGRATION_NAME });
      const id = randomUUID();
      await db.pglite.query(
        `insert into artifacts (id, org_id, path) values ($1, $2, $3)`,
        [id, DEFAULT_ORG_ID, "legacy/output.txt"],
      );

      await db.orm.migrator.up({ to: MIGRATION_NAME });

      const rows = await db.pglite.query<{
        filename: string;
        run_id: string | null;
        agent_name: string | null;
      }>(
        `
          select a.filename, a.run_id, r.agent_name
          from artifacts a
          join agent_runs r on r.id = a.run_id
          where a.id = $1
        `,
        [id],
      );

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]!.filename).toBe("legacy/output.txt");
      expect(rows.rows[0]!.run_id).not.toBeNull();
      expect(rows.rows[0]!.agent_name).toBe("artifact-migration");
    } finally {
      await db.close();
    }
  });

  it("rolls back cleanly and removes migration sentinel agent runs", async () => {
    const db = await createTestOrm();
    try {
      await db.orm.migrator.down({ to: PREVIOUS_MIGRATION_NAME });
      const id = randomUUID();
      const realRunId = randomUUID();
      const realArtifactId = randomUUID();
      await db.pglite.query(
        `insert into artifacts (id, org_id, path) values ($1, $2, $3)`,
        [id, DEFAULT_ORG_ID, "legacy/rollback.txt"],
      );

      await db.orm.migrator.up({ to: MIGRATION_NAME });
      await db.pglite.query(
        `
          insert into agent_runs (id, org_id, status, agent_name)
          values ($1, $2, 'succeeded', 'codex')
        `,
        [realRunId, DEFAULT_ORG_ID],
      );
      await db.pglite.query(
        `
          insert into artifacts (id, org_id, run_id, filename, path)
          values ($1, $2, $3, 'real-run.txt', 'legacy/real-run.txt')
        `,
        [realArtifactId, DEFAULT_ORG_ID, realRunId],
      );
      await db.orm.migrator.down({ to: PREVIOUS_MIGRATION_NAME });

      const sentinelRows = await db.pglite.query<{ count: string }>(
        `select count(*)::text as count from agent_runs where agent_name = 'artifact-migration'`,
      );
      expect(sentinelRows.rows).toEqual([{ count: "0" }]);
      const realRunRows = await db.pglite.query<{ agent_name: string | null }>(
        `select agent_name from agent_runs where id = $1`,
        [realRunId],
      );
      expect(realRunRows.rows).toEqual([{ agent_name: "codex" }]);

      await db.orm.migrator.up({ to: MIGRATION_NAME });
      const migratedRows = await db.pglite.query<{
        filename: string;
        run_id: string | null;
      }>(
        `select filename, run_id from artifacts where id = $1`,
        [id],
      );
      expect(migratedRows.rows[0]?.filename).toBe("legacy/rollback.txt");
      expect(migratedRows.rows[0]?.run_id).not.toBeNull();
    } finally {
      await db.close();
    }
  });
});
