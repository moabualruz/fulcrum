/**
 * TDD — Pillar 5 skills registry migration.
 *
 * Asserts FulcrumSkill + SkillVersion entity metadata, repository wiring,
 * DB-level enum/unique enforcement, and migration idempotency.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md
 */

import { describe, it, expect } from "bun:test";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../../../src/db/PGliteKyselyDriver.ts";
import {
  Account,
  FeatureFlag,
  Invitation,
  Org,
  OrgMember,
  Session,
  User,
  Verification,
} from "../../../src/db/entities/auth/index.ts";
import { SchemaMigration } from "../../../src/db/entities/SchemaMigration.ts";
import { Event } from "../../../src/db/entities/core/Event.ts";
import { Task } from "../../../src/db/entities/tasks/Task.ts";
import { Document } from "../../../src/db/entities/docs/Document.ts";
import { Memory } from "../../../src/db/entities/memory/Memory.ts";
import {
  AgentRun,
  WorkflowDefinition,
} from "../../../src/db/entities/orchestration/index.ts";
import { Artifact } from "../../../src/db/entities/artifacts/index.ts";
import { Repo } from "../../../src/db/entities/repos/index.ts";
import { Job } from "../../../src/db/entities/jobs/index.ts";
import { SearchDocument } from "../../../src/db/entities/search/index.ts";
import {
  CasbinRule,
  NotificationRule,
  WebhookSubscription,
} from "../../../src/db/entities/flags/index.ts";
import {
  Credential,
  ErrorLog,
  ExperimentAssignment,
  FeatureFlagRollout,
  TelemetryEvent,
} from "../../../src/db/entities/platform/index.ts";
import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
} from "../../../src/db/entities/skills/index.ts";
import { FulcrumSkillRepository } from "../../../src/db/repositories/skills/index.ts";

const ALL_ENTITIES = [
  SchemaMigration,
  Org,
  User,
  Session,
  Account,
  Verification,
  Invitation,
  OrgMember,
  FeatureFlag,
  Event,
  Task,
  Document,
  Memory,
  AgentRun,
  WorkflowDefinition,
  Artifact,
  Repo,
  Job,
  SearchDocument,
  CasbinRule,
  WebhookSubscription,
  NotificationRule,
  Credential,
  TelemetryEvent,
  ErrorLog,
  ExperimentAssignment,
  FeatureFlagRollout,
  FulcrumSkill,
  SkillVersion,
];

async function createSchemaOrm(): Promise<{ orm: MikroORM; pglite: PGlite }> {
  const pglite = new PGlite();
  const dialect = new PGliteKyselyDialect(() => pglite);
  const orm = await MikroORM.init({
    dbName: "postgres",
    driverOptions: dialect,
    multipleStatements: false,
    entities: ALL_ENTITIES,
    debug: false,
  });
  await orm.schema.create();
  return { orm, pglite };
}

async function closeOrm(orm: MikroORM, pglite: PGlite): Promise<void> {
  await orm.close(true);
  await (pglite as { close?: () => Promise<void> }).close?.();
}

describe("FulcrumSkill entity metadata", () => {
  it("registers fulcrum_skills with org+slug unique metadata", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      const meta = orm.getMetadata().get(FulcrumSkill);
      expect(meta.tableName).toBe("fulcrum_skills");
      expect(meta.properties["id"]!.primary).toBe(true);
      expect(meta.properties["id"]!.type).toMatch(/uuid/i);

      const org = meta.properties["org"];
      expect(org).toBeDefined();
      expect(org!.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(org!.nullable).not.toBe(true);

      const unique = meta.uniques?.find(
        (u) => u.name === "fulcrum_skills_org_slug",
      );
      expect(unique).toBeDefined();
      const properties = Array.isArray(unique!.properties)
        ? unique!.properties
        : [unique!.properties];
      expect(properties).toEqual(["org", "slug"]);
    } finally {
      await closeOrm(orm, pglite);
    }
  });

  it("exposes source enum and enabledAgents jsonb metadata", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      expect((Object.values(SkillSource) as string[]).sort()).toEqual([
        "local",
        "package",
        "upstream",
      ]);

      const meta = orm.getMetadata().get(FulcrumSkill);
      expect(meta.properties["source"]).toBeDefined();
      expect(meta.properties["enabledAgents"]!.fieldNames).toContain(
        "enabled_agents",
      );
      expect(String(meta.properties["enabledAgents"]!.type)).toMatch(/json/i);
    } finally {
      await closeOrm(orm, pglite);
    }
  });

  it("wires FulcrumSkillRepository through em.getRepository", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      expect(orm.em.getRepository(FulcrumSkill)).toBeInstanceOf(
        FulcrumSkillRepository,
      );
    } finally {
      await closeOrm(orm, pglite);
    }
  });
});

describe("SkillVersion entity metadata", () => {
  it("registers skill_versions and links to FulcrumSkill", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      const meta = orm.getMetadata().get(SkillVersion);
      expect(meta.tableName).toBe("skill_versions");
      expect(meta.properties["id"]!.primary).toBe(true);

      const skill = meta.properties["skill"];
      expect(skill).toBeDefined();
      expect(skill!.kind).toBe(ReferenceKind.MANY_TO_ONE);
      expect(skill!.nullable).not.toBe(true);
      expect(skill!.entity() as unknown).toBe(FulcrumSkill);

      const skillMeta = orm.getMetadata().get(FulcrumSkill);
      expect(skillMeta.properties["versions"]!.kind).toBe(
        ReferenceKind.ONE_TO_MANY,
      );
    } finally {
      await closeOrm(orm, pglite);
    }
  });
});

describe("FulcrumSkill schema constraints", () => {
  it("rejects duplicate slugs within one org", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      const em = orm.em.fork();
      const org = em.create(Org, {
        name: "Local",
        slug: "local",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      em.create(FulcrumSkill, {
        org,
        name: "TDD",
        slug: "tdd",
        source: SkillSource.Local,
        enabledAgents: ["codex"],
      });
      em.create(FulcrumSkill, {
        org,
        name: "TDD copy",
        slug: "tdd",
        source: SkillSource.Upstream,
        enabledAgents: ["claude-code"],
      });

      let caught: unknown;
      try {
        await em.flush();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "fulcrum_skills_org_slug",
      );
    } finally {
      await closeOrm(orm, pglite);
    }
  });

  it("rejects sources outside upstream|local|package", async () => {
    const { orm, pglite } = await createSchemaOrm();
    try {
      const em = orm.em.fork();
      const org = em.create(Org, {
        name: "Local",
        slug: "local",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      em.create(FulcrumSkill, {
        org,
        name: "Broken",
        slug: "broken",
        source: "remote" as SkillSource,
        enabledAgents: ["codex"],
      });

      let caught: unknown;
      try {
        await em.flush();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toMatch(
        /source|enum|check/i,
      );
    } finally {
      await closeOrm(orm, pglite);
    }
  });
});

describe("skills registry migration class", () => {
  it("applies through Migrator and is idempotent on a second run", async () => {
    const pglite = new PGlite();
    const dialect = new PGliteKyselyDialect(() => pglite);
    const orm = await MikroORM.init({
      dbName: "postgres",
      driverOptions: dialect,
      multipleStatements: false,
      entities: ALL_ENTITIES,
      migrations: {
        path: new URL("../../../src/db/migrations", import.meta.url).pathname,
        pathTs: new URL("../../../src/db/migrations", import.meta.url).pathname,
        transactional: false,
        allOrNothing: false,
      },
      extensions: [Migrator],
      debug: false,
    });

    try {
      const applied = await orm.migrator.up();
      const ours = applied.find((m) => m.name.includes("skills_registry"));
      expect(ours).toBeDefined();

      const pending = await orm.migrator.getPending();
      expect(pending.length).toBe(0);

      const second = await orm.migrator.up();
      expect(second.length).toBe(0);
    } finally {
      await closeOrm(orm, pglite);
    }
  });
});
