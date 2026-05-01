#!/usr/bin/env bun

/**
 * fulcrum CLI entry-point.
 *
 * P1#19 (HIGH 3): The `db` subcommand requires a real needle-di Container
 * backed by a live MikroORM instance. We build the container here, at the
 * top level, so every subcommand receives a properly wired container rather
 * than null (which would throw at db.router.ts:get(MigratorService)).
 *
 * For commands that do not need a DB connection (e.g. `help`, `init`), we
 * still build the container lazily — only `db` subcommands trigger ORM init.
 */

import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Container } from "@needle-di/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../db/PGliteKyselyDriver.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import { registerDbBindings } from "../db/db.module.ts";

const HELP = `fulcrum

Usage:
  fulcrum init
  fulcrum db <migrate|status|history> [options]
`;

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(homedir(), ".fulcrum");
}

/**
 * Build a Container backed by a local PGlite ORM instance.
 * Used by the `db` subcommand so it has a real MigratorService.
 *
 * Returns the container and a cleanup function to close the ORM.
 */
async function buildDbContainer(): Promise<{ container: Container; cleanup: () => Promise<void> }> {
  const dbDir = join(fulcrumHome(), "db");
  await mkdir(dbDir, { recursive: true });
  const pglite = new PGlite(join(dbDir, "main"));
  await pglite.waitReady;
  const dialect = new PGliteKyselyDialect(() => pglite);
  const config = createOrmConfig({ pglite, debug: false });
  const orm = await MikroORM.init({
    ...config,
    driverOptions: dialect,
    extensions: [Migrator],
  });

  const container = new Container();
  registerDbBindings(container, orm);

  return {
    container,
    cleanup: async () => {
      await orm.close(true);
      await pglite.close();
    },
  };
}

export async function run(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const [cmd = "help", ...rest] = argv;

  switch (cmd) {
    case "init": {
      const { run: runInit } = await import("./commands/init.ts");
      await runInit(rest);
      return;
    }
    case "db": {
      const { run: runDb } = await import("./commands/db.ts");
      // Build a real container backed by a live ORM instance.
      // PermissionNotAvailableError will surface loudly until P1#06 lands.
      const { container, cleanup } = await buildDbContainer();
      try {
        await runDb(rest, container);
      } finally {
        await cleanup();
      }
      return;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`fulcrum: unknown command '${cmd}'`);
      console.error(HELP);
      process.exit(2);
  }
}

if (import.meta.main) {
  run().catch((error) => {
    console.error(`fulcrum: fatal: ${(error as Error).message}`);
    process.exit(1);
  });
}
