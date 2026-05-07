/**
 * TDD — Pillar 8 memory/context core schema.
 *
 * Covers Memory, MemoryLink, ContextSnapshot metadata, PGlite file-backed
 * migration idempotency, and doctor JSON schema health.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "../../../src/db/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "../../../src/db/seed.ts";
import { Org } from "../../../src/db/entities/auth/Org.ts";
import {
  ContextSnapshot,
  Memory,
  MemoryLink,
} from "../../../src/db/entities/memory/index.ts";

const MEMORY_PROPERTIES = [
  "id",
  "orgId",
  "projectId",
  "global",
  "kind",
  "body",
  "tags",
  "importance",
  "source",
  "sourceRef",
  "createdAt",
  "updatedAt",
  "archived",
] as const;

const MEMORY_INDEXES = [
  "memories_org_project_importance",
  "memories_org_kind",
  "memories_org_archived",
  "memories_org_global",
  "memories_body_tsv",
] as const;

const MEMORY_LINK_INDEXES = [
  "memory_links_memory",
  "memory_links_target",
] as const;

const CONTEXT_SNAPSHOT_INDEXES = [
  "context_snapshots_run",
  "context_snapshots_task",
] as const;

interface FileBackedOrm {
  orm: MikroORM;
  pglite: PGlite;
  root: string;
  close: () => Promise<void>;
}

async function createFileBackedOrm(): Promise<FileBackedOrm> {
  const root = await mkdtemp(join(tmpdir(), "fulcrum-memory-schema-"));
  const pglite = new PGlite(join(root, "db"));
  const config = createOrmConfig({ pglite });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
  };
  config.extensions = [Migrator];
  const orm = await MikroORMRuntime.init(config);

  return {
    orm,
    pglite,
    root,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function rows<T extends object>(
  orm: MikroORM,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await orm.em.getConnection().execute(sql, params)) as T[];
}

function indexNames(meta: { indexes?: Array<{ name?: string }> }): string[] {
  return (meta.indexes ?? []).map((index) => index.name ?? "");
}

describe("Memory/context entity metadata", () => {
  let db: FileBackedOrm | undefined;

  afterAll(async () => {
    await db?.close();
  });

  it("exposes PRD core Memory properties and all five indexes", async () => {
    db = await createFileBackedOrm();
    await db.orm.migrator.up();

    const meta = db.orm.getMetadata().get(Memory);
    expect(meta.tableName).toBe("memories");
    for (const property of MEMORY_PROPERTIES) {
      expect(meta.properties[property], property).toBeDefined();
    }
    for (const index of MEMORY_INDEXES) {
      expect(indexNames(meta)).toContain(index);
    }
    expect(meta.indexes?.find((index) => index.name === "memories_body_tsv")?.expression)
      .toContain("to_tsvector('english', body)");
  });

  it("exposes MemoryLink and ContextSnapshot metadata with required indexes", async () => {
    db ??= await createFileBackedOrm();
    await db.orm.migrator.up();

    const linkMeta = db.orm.getMetadata().get(MemoryLink);
    expect(linkMeta.tableName).toBe("memory_links");
    expect(linkMeta.properties["org"]).toBeDefined();
    expect(linkMeta.properties["memory"]).toBeDefined();
    expect(linkMeta.properties["targetKind"]).toBeDefined();
    expect(linkMeta.properties["targetId"]).toBeDefined();
    for (const index of MEMORY_LINK_INDEXES) {
      expect(indexNames(linkMeta)).toContain(index);
    }

    const snapshotMeta = db.orm.getMetadata().get(ContextSnapshot);
    expect(snapshotMeta.tableName).toBe("context_snapshots");
    expect(snapshotMeta.properties["org"]).toBeDefined();
    expect(snapshotMeta.properties["runId"]).toBeDefined();
    expect(snapshotMeta.properties["taskId"]).toBeDefined();
    expect(snapshotMeta.properties["bundleBlob"]).toBeDefined();
    expect(snapshotMeta.properties["tokenCount"]).toBeDefined();
    expect(snapshotMeta.properties["sliceSizes"]).toBeDefined();
    for (const index of CONTEXT_SNAPSHOT_INDEXES) {
      expect(indexNames(snapshotMeta)).toContain(index);
    }
  });
});

describe("Memory/context schema migration", () => {
  it("runs idempotently on file-backed PGlite and supports create/read/delete round-trips", async () => {
    const db = await createFileBackedOrm();
    try {
      await db.orm.migrator.up();
      await new SeedService(db.orm.em).run();

      const pending = await db.orm.migrator.getPending();
      expect(pending).toHaveLength(0);
      const second = await db.orm.migrator.up();
      expect(second).toHaveLength(0);

      const indexes = await rows<{ indexname: string; indexdef: string }>(
        db.orm,
        `
          select indexname, indexdef
          from pg_indexes
          where indexname in (
            'memories_org_project_importance',
            'memories_org_kind',
            'memories_org_archived',
            'memories_org_global',
            'memories_body_tsv',
            'memory_links_memory',
            'memory_links_target',
            'context_snapshots_run',
            'context_snapshots_task'
          )
        `,
      );
      expect(indexes.map((row) => row.indexname).sort()).toEqual(
        [
          ...MEMORY_INDEXES,
          ...MEMORY_LINK_INDEXES,
          ...CONTEXT_SNAPSHOT_INDEXES,
        ].sort(),
      );
      expect(indexes.find((row) => row.indexname === "memories_body_tsv")?.indexdef)
        .toContain("to_tsvector('english'::regconfig, body)");

      const em = db.orm.em.fork();
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      const memory = em.create(Memory, {
        org,
        projectId: "11111111-1111-1111-1111-111111111111",
        kind: "decision",
        body: "Use deterministic full-text retrieval for local memory.",
        tags: ["retrieval", "local"],
        importance: "high",
        source: "manual",
        sourceRef: { issue: "08.01" },
      });
      const link = em.create(MemoryLink, {
        org,
        memory,
        targetKind: "task",
        targetId: "22222222-2222-2222-2222-222222222222",
      });
      const snapshot = em.create(ContextSnapshot, {
        org,
        runId: "33333333-3333-3333-3333-333333333333",
        taskId: "22222222-2222-2222-2222-222222222222",
        bundleBlob: { slices: [{ kind: "memory", ids: [memory.id] }] },
        tokenCount: 42,
        sliceSizes: { memories: 1 },
      });
      em.persist([memory, link, snapshot]);
      await em.flush();
      em.clear();

      const savedMemory = await em.findOneOrFail(Memory, { id: memory.id });
      const savedLink = await em.findOneOrFail(MemoryLink, { id: link.id });
      const savedSnapshot = await em.findOneOrFail(ContextSnapshot, { id: snapshot.id });
      expect(savedMemory.body).toContain("full-text");
      expect(savedMemory.tags).toEqual(["retrieval", "local"]);
      expect(savedLink.targetKind).toBe("task");
      expect(savedSnapshot.tokenCount).toBe(42);

      em.remove([savedLink, savedSnapshot, savedMemory]);
      await em.flush();
      expect(await em.findOne(Memory, { id: memory.id })).toBeNull();
      expect(await em.findOne(MemoryLink, { id: link.id })).toBeNull();
      expect(await em.findOne(ContextSnapshot, { id: snapshot.id })).toBeNull();
    } finally {
      await db.close();
    }
  });
});

describe("doctor --json memories_schema subsystem", () => {
  it("reports memories_schema ok", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-memory-doctor-"));
    try {
      await mkdir(home, { recursive: true });
      const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "doctor", "--json"], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          HOME: home,
          FULCRUM_HOME: join(home, ".fulcrum"),
        },
      });
      const out = await new Response(proc.stdout).text();
      const err = await new Response(proc.stderr).text();
      await proc.exited;
      expect(err).toBe("");
      const report = JSON.parse(out) as {
        memoriesSchema?: { subsystem: string; ok: boolean };
      };
      expect(report.memoriesSchema).toEqual({
        subsystem: "memories_schema",
        ok: true,
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
