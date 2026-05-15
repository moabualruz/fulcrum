/**
 * TDD — Pillar 5 skills registry migration.
 *
 * Asserts FulcrumSkill + SkillVersion entity metadata, repository wiring,
 * DB-level enum/unique enforcement, and migration idempotency.
 *
 * Closes (issue): .scratch/agent-os-vision/05-router-and-skills/issues/02-fulcrum-skills-schema-migration.md
 */

import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { MikroORM, ReferenceKind } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "@platform-core/infrastructure/application-database/PGliteKyselyDriver.ts";
import {
  Account,
  FeatureFlag,
  Invitation,
  Org,
  OrgMember,
  Session,
  User,
  Verification,
} from "@platform-core/infrastructure/application-database/entities/auth/index.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { Task } from "@platform-core/infrastructure/application-database/entities/tasks/Task.ts";
import { Document } from "@platform-core/infrastructure/application-database/entities/docs/Document.ts";
import { Memory } from "@platform-core/infrastructure/application-database/entities/memory/Memory.ts";
import {
  AgentRun,
  WorkflowDefinition,
} from "@platform-core/infrastructure/application-database/entities/orchestration/index.ts";
import { Artifact } from "@platform-core/infrastructure/application-database/entities/artifacts/index.ts";
import { Repo } from "@platform-core/infrastructure/application-database/entities/repos/index.ts";
import { Job } from "@platform-core/infrastructure/application-database/entities/jobs/index.ts";
import { SearchDocument } from "@platform-core/infrastructure/application-database/entities/search/index.ts";
import {
  CasbinRule,
  NotificationRule,
  WebhookSubscription,
} from "@platform-core/infrastructure/application-database/entities/flags/index.ts";
import {
  Credential,
  ErrorLog,
  ExperimentAssignment,
  FeatureFlagRollout,
  TelemetryEvent,
} from "@platform-core/infrastructure/application-database/entities/platform/index.ts";
import {
  FulcrumSkill,
  SkillSource,
  SkillVersion,
} from "@platform-core/infrastructure/application-database/entities/skills/index.ts";
import { FulcrumSkillRepository } from "@platform-core/infrastructure/application-database/repositories/skills/index.ts";

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
        path: join(process.cwd(), "services/platform-core/src/infrastructure/application-database/migrations"),
        pathTs: join(process.cwd(), "services/platform-core/src/infrastructure/application-database/migrations"),
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
