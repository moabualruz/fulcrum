import { afterEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { MikroORM, type MikroORM as MikroORMType } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { hasAnyOrg } from "@platform-core/application/init/queries.ts";

let orm: MikroORMType | null = null;
let pglite: PGlite | null = null;

afterEach(async () => {
  await orm?.close(true);
  await pglite?.close();
  orm = null;
  pglite = null;
});

async function freshOrm(): Promise<MikroORMType> {
  pglite = new PGlite();
  orm = await MikroORM.init(createOrmConfig({ pglite, debug: false }));
  await orm.migrator.up();
  return orm;
}

describe("application init queries", () => {
  test("hasAnyOrg returns false before seed and true after an org exists", async () => {
    const testOrm = await freshOrm();
    const em = testOrm.em;

    expect(await hasAnyOrg(em)).toBe(false);

    em.persist(em.create(Org, {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Local",
      slug: "local",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    /* flushed */

    expect(await hasAnyOrg(em)).toBe(true);
  });
});
