import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { Container } from "@needle-di/core";
import { MikroORM, type Options } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";

import { PGliteKyselyDialect } from "../../db/PGliteKyselyDriver.ts";
import { registerDbBindings } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { createOrmConfig } from "../../db/mikro-orm.config.ts";
import { MigratorService } from "../../db/migrator-service.ts";
import { SeedService } from "../../db/seed.ts";
import { registerSeedBindings } from "../../db/seed.module.ts";

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

function includeOrgEntity(config: Options): Options {
  const entities = config.entities ?? [];
  if (Array.isArray(entities) && !entities.includes(Org)) {
    return { ...config, entities: [...entities, Org] };
  }
  return config;
}

async function openLocalOrm(): Promise<{ orm: MikroORM; pglite: PGlite }> {
  const dbDir = join(fulcrumHome(), "db");
  await mkdir(dbDir, { recursive: true });
  const pglite = new PGlite(join(dbDir, "main"));
  await pglite.waitReady;
  const dialect = new PGliteKyselyDialect(() => pglite);
  const config = includeOrgEntity(createOrmConfig({ pglite, debug: false }));
  const orm = await MikroORM.init({
    ...config,
    driverOptions: dialect,
    extensions: [Migrator],
    migrations: {
      ...config.migrations,
      transactional: false,
      allOrNothing: false,
    },
  });
  return { orm, pglite };
}

export async function run(_argv: readonly string[] = []): Promise<void> {
  const { orm, pglite } = await openLocalOrm();
  try {
    const container = new Container();
    registerDbBindings(container, orm);
    registerSeedBindings(container);

    await container.get(MigratorService).migrate();

    const orgRepo = orm.em.fork().getRepository(Org);
    const hadOrg = (await orgRepo.count()) > 0;
    await container.get(SeedService).run();
    if (!hadOrg) {
      console.log("✓ Local org bootstrapped");
      return;
    }

    console.log("✓ Already initialized");
  } finally {
    await orm.close(true);
    await pglite.close();
  }
}
