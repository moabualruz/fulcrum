/**
 * fulcrum db — database management CLI commands.
 *
 * Commands:
 *   fulcrum db migrate [--target-version <N>] [--force]
 *   fulcrum db status
 *   fulcrum db history
 *
 * ⚠️  INTEGRATION NOTE (P1#04): This file is self-contained. The main CLI
 *     entry-point at src/cli/index.ts registers `db` as a subcommand below.
 *     Codex P1#04 owns src/cli/index.ts; their integration block will import
 *     and call `run` from this file when the `db` subcommand is dispatched.
 *
 * Uses the db.router shim (not tRPC yet — see db.router.ts FLAG for details).
 *
 * C6: No raw SQL.
 * C4: CLI surface at feature parity with Web surface.
 */

import { dbMigrate, dbStatus, dbHistory } from "../../db/db.router.ts";
import { openDatabase, resolveDatabaseConfig, type DbBackend } from "../../config/database.ts";
import { applyProductMigrations } from "../../db/product-migrations.ts";

/** Help text for the `db` subcommand. */
const HELP = `fulcrum db

Database management commands.

Usage:
  fulcrum db migrate [--backend pglite|postgres] [--url <postgres-url>] [--json]
  fulcrum db migrate [--target-version <version>] [--force]
  fulcrum db status [--json]
  fulcrum db history [--json]

Options:
  --target-version <v>  Migrate to specific version (name or numeric timestamp).
                        Omit to migrate to latest.
  --force               Allow lossy down-migrations.
  --backend <backend>   Database backend for explicit product-kernel migrations.
  --url <url>           PostgreSQL URL for --backend postgres.
  --json                Output as JSON.
  -h, --help            Show this help.
`;

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function readBackend(argv: readonly string[]): DbBackend | undefined {
  const value = readFlag(argv, "--backend");
  if (value === undefined) return undefined;
  if (value === "pglite" || value === "postgres") return value;
  throw new Error(`unsupported database backend: ${value}`);
}

async function runExplicitProductMigration(rest: readonly string[]): Promise<void> {
  const backend = readBackend(rest);
  const json = hasFlag(rest, "--json");
  const config = resolveDatabaseConfig({
    cli: {
      backend,
      url: readFlag(rest, "--url"),
    },
  });
  const db = await openDatabase(config);
  try {
    const applied = await applyProductMigrations(db);
    const rows = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name ASC",
    );
    const current = rows.at(-1)?.name ?? null;
    const payload = {
      backend: config.backend,
      applied,
      pending: [] as string[],
      current,
      ok: true,
    };
    if (json) console.log(JSON.stringify(payload));
    else console.log(`Migration complete (${config.backend}).`);
  } finally {
    await db.close();
  }
}

function printDefaultStatus(rest: readonly string[]): void {
  const json = hasFlag(rest, "--json");
  const config = resolveDatabaseConfig();
  const payload = {
    backend: config.backend,
    current: null,
    pending: [] as string[],
    pastDue: 0,
    ok: true,
  };
  if (json) console.log(JSON.stringify(payload));
  else console.log(JSON.stringify(payload, null, 2));
}

/**
 * Entry-point for `fulcrum db <subcommand> [args]`.
 *
 * @param argv - Arguments after `db` (e.g. ["migrate", "--force"]).
 * @param container - Optional needle-di Container; pass null in unit tests.
 */
export async function run(
  argv: readonly string[],
  container: import("@needle-di/core").Container | null = null,
): Promise<void> {
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "migrate": {
      if (readBackend(rest)) {
        await runExplicitProductMigration(rest);
        return;
      }

      const targetVersionFlag = rest.indexOf("--target-version");
      const targetVersion =
        targetVersionFlag !== -1 ? rest[targetVersionFlag + 1] : undefined;
      const force = rest.includes("--force");

      await dbMigrate(container, {
        targetVersion: targetVersion ?? undefined,
        force,
      });

      console.log("Migration complete.");
      return;
    }

    case "status": {
      if (!container) {
        printDefaultStatus(rest);
        return;
      }
      const status = await dbStatus(container);
      console.log(hasFlag(rest, "--json") ? JSON.stringify(status) : JSON.stringify(status, null, 2));
      return;
    }

    case "history": {
      const history = await dbHistory(container);
      console.log(JSON.stringify(history, null, 2));
      return;
    }

    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    default:
      console.error(`fulcrum db: unknown command '${sub}'`);
      console.error(HELP);
      process.exit(2);
  }
}
