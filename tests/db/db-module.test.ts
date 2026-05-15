import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { PGlite } from "@electric-sql/pglite";

import { createOrmConfig } from "@platform-core/infrastructure/application-database/mikro-orm.config.ts";
import { registerDbBindings } from "@platform-core/infrastructure/application-database/db.module.ts";
import { FeatureFlag } from "@platform-core/infrastructure/application-database/entities/auth/FeatureFlag.ts";
import { FeatureFlagRepository } from "@platform-core/infrastructure/application-database/repositories/auth/FeatureFlagRepository.ts";
import { FlagRegistry } from "@platform-core/application/feature-flags/registry.ts";

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init(createOrmConfig({ pglite: new PGlite() }));
});

afterAll(async () => {
  await orm.close(true);
});

describe("registerDbBindings FlagRegistry cache ownership", () => {
  test("can share one FlagRegistry across forked request containers", () => {
    const shared = new FlagRegistry(
      orm.em.fork().getRepository(FeatureFlag) as FeatureFlagRepository,
    );
    const first = new Container();
    const second = new Container();

    registerDbBindings(first, orm, orm.em.fork(), { flagRegistry: shared });
    registerDbBindings(second, orm, orm.em.fork(), { flagRegistry: shared });

    expect(first.get(FlagRegistry)).toBe(shared);
    expect(second.get(FlagRegistry)).toBe(shared);
    expect(first.get(FlagRegistry)).toBe(second.get(FlagRegistry));
  });
});
