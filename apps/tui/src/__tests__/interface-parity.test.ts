import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { setTenantSetting } from "@platform-core/application/settings/commands.ts";
import { createTask } from "@work-management/application/tasks/commands.ts";
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import { createTestContainer, createTestOrm } from "@test-support/index.ts";
import { buildCaller } from "../index.ts";

const RUNTIME_FILES = [
  "../index.ts",
  "../telemetry.ts",
] as const;

const SCREEN_FILES = [
  "../screens/settings-screens.ts",
  "../screens/routing-rules.ts",
  "../screens/search.ts",
  "../screens/skills.ts",
  "../screens/sprints.ts",
  "../screens/settings.ts",
] as const;

async function source(path: string): Promise<string> {
  return await readFile(new URL(path, import.meta.url), "utf-8");
}

async function ensureSession(db: Awaited<ReturnType<typeof createTestOrm>>): Promise<void> {
  const em = db.em;
  em.persist(em.create(Session, {
    id: `parity-${crypto.randomUUID()}`,
    userId: db.seed.userId,
    orgId: db.seed.orgId,
    activeOrganizationId: db.seed.orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ipAddress: null,
    userAgent: "test",
  }));
  /* flushed */
}

describe("interface TUI interface encapsulation", () => {
  const persistenceImportPattern = new RegExp([
    `@mikro-${"orm"}/postgresql`,
    "db/db.module",
    ["db", "entities"].join("/"),
    ["product", "kernel"].join("-"),
  ].join("|").replaceAll("/", "\\/"));
  const directRuntimeSymbolPattern = new RegExp(`EntityManager|Mikro${"ORM"}|ENTITY_MANAGER_TOKEN|registerDbBindings`);
  const directOrmCallPattern = /em\.(persist|flush|find|findOne|getRepository|create|transactional)/;

  test("runtime caller and telemetry setup do not import persistence internals", async () => {
    for (const file of RUNTIME_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(persistenceImportPattern);
      expect(text).not.toMatch(directRuntimeSymbolPattern);
      expect(text).not.toMatch(directOrmCallPattern);
    }
  });

  test("TUI screens stay DTO-only and caller-backed", async () => {
    for (const file of SCREEN_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(persistenceImportPattern);
      expect(text).not.toMatch(new RegExp([
        "EntityManager",
        `Mikro${"ORM"}`,
        ["open", "Database"].join(""),
        ["get", "Product", "Db"].join(""),
        ["Product", "Db"].join(""),
        "legacyStore",
      ].join("|")));
      expect(text).not.toMatch(directOrmCallPattern);
    }
  });

  test("search screen delegates query interpretation to caller path", async () => {
    const text = await source("../screens/search.ts");

    expect(text).not.toContain("../../search/nl-filter.ts");
    expect(text).toMatch(/caller\.search\.query/);
  });

  test("buildCaller exposes application-created task and setting data to TUI surfaces", async () => {
      const db = await createTestOrm();
      try {
        const container = createTestContainer(db);
      const created = await createTask(db.em, {
        orgId: db.seed.orgId,
        userId: db.seed.userId,
        projectId: null,
      }, {
        title: "TUI parity task",
        status: "todo",
      });
      await setTenantSetting(db.em, {
        orgId: db.seed.orgId,
        userId: db.seed.userId,
        projectId: null,
      }, {
        key: "public-api",
        value: { enabled: true },
      });
      await ensureSession(db);

      const caller = await buildCaller(container);
      const tasks = await caller.tasks?.list() ?? [];
      const flags = await caller.flags.list();

      expect(tasks.find((task) => task.id === created.id)).toMatchObject({
        id: created.id,
        title: "TUI parity task",
        status: "todo",
      });
      expect(flags.find((flag) => flag.name === "public-api")).toMatchObject({
        name: "public-api",
        enabled: true,
      });
    } finally {
      await db.close();
    }
  });
});
