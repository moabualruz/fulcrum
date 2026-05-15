import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { MikroORM, type Options } from "@mikro-orm/postgresql";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { SchemaMigration } from "@platform-core/infrastructure/application-database/entities/SchemaMigration.ts";

const MIGRATIONS_PATH = join(process.cwd(), "services/platform-core/src/infrastructure/application-database/migrations");

async function createMigratedOrm(): Promise<{ orm: MikroORM; pglite: PGlite }> {
  const pglite = new PGlite();
  const config = createOrmConfig({ pglite, debug: false });
  config.migrations = {
    ...((config.migrations ?? {}) as NonNullable<Options["migrations"]>),
    transactional: false,
    snapshot: false,
  };
  const orm = await MikroORM.init(config);
  await orm.migrator.up();
  return { orm, pglite };
}

async function closeOrm(orm: MikroORM, pglite: PGlite): Promise<void> {
  await orm.close(true);
  await pglite.close();
}

async function migrateDown(orm: MikroORM): Promise<string> {
  const executed = await orm.migrator.getExecuted();
  expect(executed.length).toBeGreaterThan(1);
  const latest = executed.at(-1)!.name;
  const previous = executed.at(-2)!.name;

  await orm.migrator.down({ to: previous });

  const afterDown = await orm.migrator.getExecuted();
  expect(afterDown.at(-1)!.name).toBe(previous);
  return latest;
}

describe("migration downgrade smoke", () => {
  test("every migration implements down()", async () => {
    const files = (await readdir(MIGRATIONS_PATH))
      .filter((name) => /^Migration.*\.ts$/.test(name))
      .sort();
    const missingDown: string[] = [];

    for (const file of files) {
      const contents = await Bun.file(`${MIGRATIONS_PATH}/${file}`).text();
      if (!/override\s+async\s+down\(\):\s+Promise<void>/.test(contents)) {
        missingDown.push(file);
      }
    }

    expect(missingDown).toEqual([]);
  });

  test("migrates latest down one step and back up", async () => {
    const { orm, pglite } = await createMigratedOrm();
    try {
      const latest = await migrateDown(orm);
      await orm.migrator.up({ to: latest });

      const executed = await orm.migrator.getExecuted();
      expect(executed.at(-1)!.name).toBe(latest);

      const schemaMigrationMeta = orm.getMetadata().get(SchemaMigration);
      expect(schemaMigrationMeta.tableName).toBe("schema_migrations");

      const orgRows = await orm.em.execute<{ count: string }[]>(
        `select count(*)::text as count from orgs`,
        [],
        "all",
      );
      expect(Number(orgRows[0]!.count)).toBeGreaterThanOrEqual(0);
    } finally {
      await closeOrm(orm, pglite);
    }
  });
});
