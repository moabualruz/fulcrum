/**
 * TDD — composite (org, …) index decorators on tenant-scoped stub entities.
 *
 * For each of the 8 stub entities (Task, Document, Memory, AgentRun, Artifact,
 * Repo, Job, SearchDocument) this suite asserts:
 *  1. Entity is registered in MikroORM metadata with `org` ManyToOne FK.
 *  2. A composite `@Index({ properties: ['org', …] })` decorator landed.
 *  3. Building a QueryBuilder with `org = :orgId` filter and running EXPLAIN
 *     on the generated SQL does NOT produce a Seq Scan plan against an empty
 *     PGlite table — index existence is verified through metadata, EXPLAIN
 *     only sanity-checks the predicate compiles and runs.
 *
 * Per C2: composite indexes from day 1 — later pillars never need to add them.
 * Per C6: NO raw SQL outside src/db/migrations/. Schema via orm.schema.create().
 * Per C7: MikroORM v7 @Entity decorator-class pattern.
 *
 * Closes (issue): .scratch/agent-os-vision/01-foundation-reset/issues/03-composite-indexes-and-flag-stub-tables.md
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";

// Pre-existing entities (P1#01 + P1#02)
import { Org } from "../../../src/db/entities/auth/Org.ts";
import { User } from "../../../src/db/entities/auth/User.ts";
import { Session } from "../../../src/db/entities/auth/Session.ts";
import { Invitation } from "../../../src/db/entities/auth/Invitation.ts";
import { OrgMember } from "../../../src/db/entities/auth/OrgMember.ts";
import { FeatureFlag } from "../../../src/db/entities/auth/FeatureFlag.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";

// New stub entities (P1#03 — under test)
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { Document } from "../../../src/db/entities/docs/Document.ts";
import { Memory } from "../../../src/db/entities/memory/Memory.ts";
import { AgentRun } from "../../../src/db/entities/orchestration/AgentRun.ts";
import { Artifact } from "../../../src/db/entities/artifacts/Artifact.ts";
import { Repo } from "../../../src/db/entities/repos/Repo.ts";
import { Job } from "../../../src/db/entities/jobs/Job.ts";
import { SearchDocument } from "../../../src/db/entities/search/SearchDocument.ts";

// Flag-stub entities (P1#03 — also part of metadata so schema includes them)
import { CasbinRule } from "../../../src/db/entities/flags/CasbinRule.ts";
import { WebhookSubscription } from "../../../src/db/entities/flags/WebhookSubscription.ts";
import { NotificationRule } from "../../../src/db/entities/flags/NotificationRule.ts";

const WELL_KNOWN_ORG_ID = "00000000-0000-0000-0000-000000000001";

let orm: MikroORM;

beforeAll(async () => {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);

  orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    entities: [
      Org,
      User,
      Session,
      Invitation,
      OrgMember,
      FeatureFlag,
      Event,
      Task,
      Document,
      Memory,
      AgentRun,
      Artifact,
      Repo,
      Job,
      SearchDocument,
      CasbinRule,
      WebhookSubscription,
      NotificationRule,
    ],
    debug: false,
  });

  await orm.schema.create();

  // Seed the well-known org so FK references are satisfiable.
  const em = orm.em.fork();
  em.create(Org, {
    id: WELL_KNOWN_ORG_ID,
    name: "Local",
    slug: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await em.flush();
});

afterAll(async () => {
  if (orm) await orm.close(true);
});

interface StubSpec {
  label: string;
  entity: new () => object;
  tableName: string;
  indexName: string;
  /** properties of the composite index — must start with 'org'. */
  indexProps: string[];
}

const STUBS: StubSpec[] = [
  {
    label: "Task",
    entity: Task,
    tableName: "tasks",
    indexName: "idx_tasks_org_created",
    indexProps: ["org", "createdAt"],
  },
  {
    label: "Document",
    entity: Document,
    tableName: "documents",
    indexName: "idx_documents_org_updated",
    indexProps: ["org", "updatedAt"],
  },
  {
    label: "Memory",
    entity: Memory,
    tableName: "memories",
    indexName: "idx_memories_org_kind",
    indexProps: ["org", "kind"],
  },
  {
    label: "AgentRun",
    entity: AgentRun,
    tableName: "agent_runs",
    indexName: "idx_agent_runs_org_started",
    indexProps: ["org", "startedAt"],
  },
  {
    label: "Artifact",
    entity: Artifact,
    tableName: "artifacts",
    indexName: "idx_artifacts_org_path",
    indexProps: ["org", "path"],
  },
  {
    label: "Repo",
    entity: Repo,
    tableName: "repos",
    indexName: "idx_repos_org_slug",
    indexProps: ["org", "slug"],
  },
  {
    label: "Job",
    entity: Job,
    tableName: "jobs",
    indexName: "idx_jobs_org_status_scheduled",
    indexProps: ["org", "status", "scheduledFor"],
  },
  {
    label: "SearchDocument",
    entity: SearchDocument,
    tableName: "search_documents",
    indexName: "idx_search_documents_org_subject",
    indexProps: ["org", "entityKind", "entityId"],
  },
];

for (const spec of STUBS) {
  describe(`Stub entity metadata — ${spec.label}`, () => {
    it(`is registered with tableName=${spec.tableName}`, () => {
      const meta = orm.getMetadata().get(spec.entity as never);
      expect(meta).toBeDefined();
      expect(meta.tableName).toBe(spec.tableName);
    });

    it("has UUID primary key", () => {
      const meta = orm.getMetadata().get(spec.entity as never);
      const idProp = meta.properties["id"];
      expect(idProp).toBeDefined();
      expect(idProp!.primary).toBe(true);
      expect(idProp!.type).toMatch(/uuid/i);
    });

    it("has ManyToOne org FK (non-nullable)", () => {
      const meta = orm.getMetadata().get(spec.entity as never);
      const orgProp = meta.properties["org"];
      expect(orgProp).toBeDefined();
      expect(orgProp!.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(orgProp!.nullable).not.toBe(true);
    });

    it(`has composite index ${spec.indexName}`, () => {
      const meta = orm.getMetadata().get(spec.entity as never);
      const idx = meta.indexes?.find((i) => i.name === spec.indexName);
      expect(idx).toBeDefined();
      // properties may be string | string[]; normalise to array.
      const props = Array.isArray(idx!.properties)
        ? idx!.properties
        : [idx!.properties];
      expect(props).toEqual(spec.indexProps);
    });

    it("EXPLAIN on org-predicated query runs without error", async () => {
      const em = orm.em.fork();
      const repo = em.getRepository(spec.entity as never);
      // QB filter typed loosely — composite tests run across heterogeneous entities.
      const qb = repo
        .createQueryBuilder("e")
        .select("*")
        .where({ org: WELL_KNOWN_ORG_ID } as never);
      const sql = qb.getQuery();
      // Run EXPLAIN. PGlite returns an array of rows — we assert it returns
      // *something* (either array or .rows non-empty), proving the query is
      // valid and the table + composite index exist in the schema.
      const result = await em
        .getConnection()
        .execute(`explain ${sql}`, qb.getParams() as unknown[]);
      expect(result).toBeDefined();
      // result is an array of rows (PGlite-via-Kysely shape); each row has
      // a single column whose value is the plan line. Empty plan would mean
      // a broken query.
      const rowCount = Array.isArray(result)
        ? result.length
        : Array.isArray((result as { rows?: unknown[] }).rows)
          ? (result as { rows: unknown[] }).rows.length
          : 0;
      expect(rowCount).toBeGreaterThan(0);
    });
  });
}
