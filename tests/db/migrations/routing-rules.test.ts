/**
 * TDD - RoutingRule entity + migration class + routing event payload.
 *
 * Verifies P5#01: routing_rules table, source enum constraint, Q22 composite
 * indexes, repository export, duplicate names allowed, and typed routed-event
 * payload validation.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { MikroORM, Options } from "@mikro-orm/postgresql";
import { MikroORM as MikroORMRuntime, ReferenceKind } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { DEFAULT_ORG_ID, SeedService } from "@platform-core/infrastructure/application-database/seed.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";

const MIGRATION_NAME = "Migration20260502050000_routing_rules";

interface RouterModules {
  RoutingRule: new () => object;
  RoutingRuleRepository: new (...args: never[]) => object;
  RoutingRuleSource: {
    Manual: "manual";
    Learned: "learned";
    Imported: "imported";
  };
  RoutingEventPayloadSchema: {
    parse(input: unknown): unknown;
    safeParse(input: unknown): { success: boolean };
  };
}

interface TestDb {
  orm: MikroORM;
  pglite: PGlite;
  close: () => Promise<void>;
}

async function loadRouterModules(): Promise<RouterModules> {
  const entity = await import("@platform-core/infrastructure/application-database/entities/router/RoutingRule.ts");
  const repo = await import("@platform-core/infrastructure/application-database/repositories/router/RoutingRuleRepository.ts");
  const repoBarrel = await import("@platform-core/infrastructure/application-database/repositories/router/index.ts");
  const payload = await import("@fulcrum/server/router/routing-event-payload.ts");
  const migration = await import(
    "@platform-core/infrastructure/application-database/migrations/Migration20260502050000_routing_rules.ts"
  );

  expect(migration[MIGRATION_NAME]).toBeDefined();
  expect(repoBarrel.RoutingRuleRepository).toBe(repo.RoutingRuleRepository);

  return {
    RoutingRule: entity.RoutingRule,
    RoutingRuleRepository: repo.RoutingRuleRepository,
    RoutingRuleSource: entity.RoutingRuleSource,
    RoutingEventPayloadSchema: payload.RoutingEventPayloadSchema,
  };
}

async function buildBlankOrm(): Promise<TestDb> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite });

  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    allOrNothing: false,
    snapshot: false,
  };

  const orm = await MikroORMRuntime.init(config);

  return {
    orm,
    pglite,
    close: async () => {
      await orm.close(true);
      await (pglite as { close?: () => Promise<void> }).close?.();
    },
  };
}

async function buildMigratedOrm(): Promise<TestDb> {
  const db = await buildBlankOrm();
  await db.orm.migrator.up();
  await new SeedService(db.orm.em).run();
  return db;
}

describe("RoutingRule schema metadata", () => {
  let modules: RouterModules;
  let db: TestDb;

  beforeAll(async () => {
    modules = await loadRouterModules();
    db = await buildMigratedOrm();
  });

  afterAll(async () => {
    await db?.close();
  });

  it("declares routing_rules table with org FK, source enum property, and Q22 indexes", () => {
    const meta = db.orm.getMetadata().get(modules.RoutingRule);

    expect(meta.tableName).toBe("routing_rules");
    expect(meta.properties["id"]?.primary).toBe(true);
    expect(meta.properties["org"]?.kind).toBe(ReferenceKind.MANY_TO_ONE);
    expect(meta.properties["org"]?.nullable).not.toBe(true);
    expect(meta.properties["project"]?.fieldNames).toContain("project_id");
    expect(meta.properties["source"]).toBeDefined();

    const priority = meta.indexes?.find((idx) => idx.name === "routing_rules_org_priority");
    expect(priority).toBeDefined();
    expect(Array.isArray(priority!.properties) ? priority!.properties : [priority!.properties])
      .toEqual(["org", "priority", "enabled"]);

    const project = meta.indexes?.find((idx) => idx.name === "routing_rules_org_project");
    expect(project).toBeDefined();
    expect(Array.isArray(project!.properties) ? project!.properties : [project!.properties])
      .toEqual(["org", "project"]);
  });

  it("wires em.getRepository(RoutingRule) to RoutingRuleRepository", () => {
    const repo = db.orm.em.fork().getRepository(modules.RoutingRule);
    expect(repo).toBeInstanceOf(modules.RoutingRuleRepository);
  });
});

describe("Migration20260502050000_routing_rules", () => {
  let modules: RouterModules;

  beforeAll(async () => {
    modules = await loadRouterModules();
  });

  it("applies through Migrator and reruns idempotently with same row count", async () => {
    const db = await buildBlankOrm();
    try {
      const first = await db.orm.migrator.up();
      expect(first.map((migration) => migration.name)).toContain(MIGRATION_NAME);
      await new SeedService(db.orm.em).run();

      const em = db.orm.em.fork();
      const repo = em.getRepository(modules.RoutingRule);
      const org = em.getReference(Org, DEFAULT_ORG_ID);
      repo.create({
        org,
        name: "Bug fixes to Codex",
        conditionsJson: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
        actionAgent: "codex",
        actionSkillSet: [],
        priority: 10,
        enabled: true,
        source: modules.RoutingRuleSource.Manual,
      } as never);
      await em.flush();

      const before = await repo.count();
      const second = await db.orm.migrator.up();

      expect(second).toHaveLength(0);
      expect(await repo.count()).toBe(before);
    } finally {
      await db.close();
    }
  });

  it("rejects invalid source values at repository write boundary", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const repo = em.getRepository(modules.RoutingRule);

      let caught: unknown;
      try {
        await repo.insert({
          org: em.getReference(Org, DEFAULT_ORG_ID),
          name: "Bad source",
          conditionsJson: {},
          actionAgent: "codex",
          actionSkillSet: [],
          priority: 100,
          enabled: true,
          source: "external",
        } as never);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(String((caught as { message?: unknown }).message ?? caught)).toContain(
        "routing_rules_source_check",
      );
    } finally {
      await db.close();
    }
  });

  it("allows duplicate names within the same org because no org/name unique index exists", async () => {
    const db = await buildMigratedOrm();
    try {
      const em = db.orm.em.fork();
      const repo = em.getRepository(modules.RoutingRule);
      const org = em.getReference(Org, DEFAULT_ORG_ID);

      for (const priority of [10, 20]) {
        repo.create({
          org,
          name: "Docs to Claude",
          conditionsJson: { any: [{ fact: "task.kind", operator: "equal", value: "docs" }] },
          actionAgent: "claude-code",
          actionSkillSet: [],
          priority,
          enabled: true,
          source: modules.RoutingRuleSource.Imported,
        } as never);
      }

      await em.flush();

      expect(await repo.count({ org, name: "Docs to Claude" } as never)).toBe(2);
    } finally {
      await db.close();
    }
  });
});

describe("RoutingEventPayloadSchema", () => {
  it("validates verb='routed' payload shape", async () => {
    const modules = await loadRouterModules();

    expect(
      modules.RoutingEventPayloadSchema.parse({
        rule_id: "11111111-1111-4111-8111-111111111111",
        source: "rule",
        agent: "codex",
        confidence: 1,
      }),
    ).toEqual({
      rule_id: "11111111-1111-4111-8111-111111111111",
      source: "rule",
      agent: "codex",
      confidence: 1,
    });

    expect(
      modules.RoutingEventPayloadSchema.parse({
        rule_id: null,
        source: "explicit",
        agent: "codex",
        confidence: 1,
      }),
    ).toEqual({
      rule_id: null,
      source: "explicit",
      agent: "codex",
      confidence: 1,
    });

    expect(
      modules.RoutingEventPayloadSchema.safeParse({
        rule_id: "11111111-1111-4111-8111-111111111111",
        source: "external",
        agent: "codex",
        confidence: 1,
      }).success,
    ).toBe(false);

    expect(
      modules.RoutingEventPayloadSchema.safeParse({
        rule_id: "11111111-1111-4111-8111-111111111111",
        source: "rule",
        agent: "codex",
        confidence: 1.2,
      }).success,
    ).toBe(false);
  });
});
