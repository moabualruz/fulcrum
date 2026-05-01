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
import { pathToFileURL } from "node:url";
import { Container } from "@needle-di/core";
import { MikroORM } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { PGlite } from "@electric-sql/pglite";
import { PGliteKyselyDialect } from "../db/PGliteKyselyDriver.ts";
import { createOrmConfig } from "../db/mikro-orm.config.ts";
import {
  registerDbBindings,
  SchemaMigrationRepository,
} from "../db/db.module.ts";
import { dbCanRunOnCurrentBinary } from "../db/doctor-checks.ts";

const HELP = `fulcrum

Usage:
  fulcrum init
  fulcrum db <migrate|status|history> [options]
  fulcrum web
  fulcrum tui
  fulcrum inference
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
  container.bind({ provide: MikroORM, useValue: orm });
  registerDbBindings(container, orm);

  return {
    container,
    cleanup: async () => {
      await orm.close(true);
      await pglite.close();
    },
  };
}

type MigrationInfoLike = { name?: string };
type MigratorCompat = {
  getPendingMigrations?: () => Promise<MigrationInfoLike[]>;
  getPending?: () => Promise<MigrationInfoLike[]>;
};

async function pendingMigrations(migrator: MigratorCompat): Promise<MigrationInfoLike[]> {
  if (migrator.getPendingMigrations) return migrator.getPendingMigrations();
  if (migrator.getPending) return migrator.getPending();
  return [];
}

async function verifyMigrationCompatibility(
  orm: MikroORM,
  container: Container,
): Promise<void> {
  const pending = await pendingMigrations(orm.migrator as MigratorCompat);
  if (pending.length > 0) {
    const names = pending.map((migration) => migration.name ?? "(unknown)").join(", ");
    throw new Error(`migrations pending: ${names}. Run \`fulcrum db migrate\` before \`fulcrum web\`.`);
  }

  const schemaMigrationRepo = container.get(SchemaMigrationRepository);
  const binaryCheck = await dbCanRunOnCurrentBinary(schemaMigrationRepo);
  if (binaryCheck.status === "fail") {
    throw new Error(binaryCheck.detail);
  }

  console.log("Migrations up-to-date");
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function runWeb(_argv: readonly string[]): Promise<void> {
  const { container, cleanup } = await buildDbContainer();
  console.log("MikroORM initialized");
  console.log("needle-di container ready");

  const orm = container.get(MikroORM);
  await verifyMigrationCompatibility(orm, container);

  const outputRoot = join(process.cwd(), "src", "web", ".svelte-kit", "output");
  const serverIndex = join(outputRoot, "server", "index.js");
  const manifestPath = join(outputRoot, "server", "manifest.js");
  const clientRoot = join(outputRoot, "client");

  if (!(await exists(serverIndex)) || !(await exists(manifestPath))) {
    await cleanup();
    throw new Error("web build missing. Run `bun --cwd src/web run build` before `fulcrum web`.");
  }

  const [{ Server }, { manifest }] = await Promise.all([
    import(pathToFileURL(serverIndex).href) as Promise<{
      Server: new (manifest: unknown) => {
        init(opts: {
          env: Record<string, string | undefined>;
          read: (file: string) => ReadableStream<Uint8Array>;
        }): Promise<void>;
        respond(request: Request, options: {
          platform: Record<string, never>;
          getClientAddress: () => string;
        }): Promise<Response>;
      };
    }>,
    import(pathToFileURL(manifestPath).href) as Promise<{ manifest: unknown }>,
  ]);

  const server = new Server(manifest);
  await server.init({
    env: process.env,
    read: (file: string) => Bun.file(join(clientRoot, file)).stream(),
  });

  const port = Number(process.env["PORT"] ?? "3000");
  const listener = Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname !== "/" && !pathname.endsWith("/")) {
        const assetPath = join(clientRoot, pathname);
        const asset = Bun.file(assetPath);
        if (await asset.exists()) return new Response(asset);
      }

      return server.respond(request, {
        platform: {},
        getClientAddress: () => "127.0.0.1",
      });
    },
  });

  console.log(`Web server listening on http://localhost:${listener.port}`);
  await new Promise<void>(() => {});
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
    case "web":
      await runWeb(rest);
      return;
    case "tui":
      console.log("TUI not yet implemented");
      return;
    case "inference":
      console.log("Inference sidecar not yet implemented");
      return;
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
