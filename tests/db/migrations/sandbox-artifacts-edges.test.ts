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

async function loadSandboxEntities() {
  const [artifactModule, edgeModule] = await Promise.all([
    import("../../../src/db/entities/sandbox/Artifact.ts").catch(() => undefined),
    import("../../../src/db/entities/sandbox/Edge.ts").catch(() => undefined),
  ]);

  expect(artifactModule).toBeDefined();
  expect(edgeModule).toBeDefined();

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

describe("Artifact + Edge sandbox schema", () => {
  it("declares artifact and edge properties with org-scoped indexes", async () => {
    const { Artifact, Edge } = await loadSandboxEntities();
    const db = await createTestOrm();
    try {
      const artifactMeta = db.orm.getMetadata().get(Artifact);
      const edgeMeta = db.orm.getMetadata().get(Edge);

      expect(artifactMeta.tableName).toBe("artifacts");
      expect(artifactMeta.properties["org"]?.fieldNames).toEqual(["org_id"]);
      expect(artifactMeta.properties["run"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(artifactMeta.properties["run"]?.fieldNames).toEqual(["run_id"]);
      expect(artifactMeta.properties["task"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(artifactMeta.properties["task"]?.nullable).toBe(true);
      expect(artifactMeta.properties["task"]?.fieldNames).toEqual(["task_id"]);
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
        "edges_from_to_kind",
        "edges_to_lookup",
      ]);
      expect(rows.map((row) => row.indexname)).toEqual([
        "artifacts_org_run",
        "artifacts_org_task",
        "edges_from_to_kind",
        "edges_to_lookup",
      ]);
      expect(rows.find((row) => row.indexname === "edges_from_to_kind")?.indexdef)
        .toContain("UNIQUE");

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
});
