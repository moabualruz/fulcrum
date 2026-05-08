/**
 * fulcrum db — database management CLI commands.
 *
 * Commands:
 *   fulcrum db migrate [--target-version <N>] [--force]
 *   fulcrum db status
 *   fulcrum db history
 *
 * ⚠️  INTEGRATION NOTE (P1#04): This file is self-contained. The main CLI
 *     entry-point at apps/cli/src/index.ts registers `db` as a subcommand below.
 *     Codex P1#04 owns apps/cli/src/index.ts; their integration block will import
 *     and call `run` from this file when the `db` subcommand is dispatched.
 *
 * Uses the db.router shim (not tRPC yet — see db.router.ts FLAG for details).
 *
 * C6: No raw SQL.
 * C4: CLI surface at feature parity with Web surface.
 */

import { dbMigrate, dbStatus, dbHistory } from "@/db/db.router.ts";
import type { DbBackend } from "@/config/database.ts";
import { defaultProductDbStatus, runExplicitProductMigration } from "@/application/db/commands.ts";
import { resetPlanForFulcrumHome } from "@/application/init/local-state.ts";

/** Help text for the `db` subcommand. */
const HELP = `fulcrum db

Database management commands.

Usage:
  fulcrum db migrate [--backend pglite|postgres] [--url <postgres-url>] [--json]
  fulcrum db migrate [--target-version <version>] [--force]
  fulcrum db status [--json]
  fulcrum db history [--json]
  fulcrum db reset-local-state --fulcrum-home <path> --yes-reset-local-state [--json]

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

async function runExplicitProductMigrationCli(rest: readonly string[]): Promise<void> {
  const backend = readBackend(rest);
  const json = hasFlag(rest, "--json");
  const payload = await runExplicitProductMigration({ backend, url: readFlag(rest, "--url") });
  if (json) console.log(JSON.stringify(payload));
  else console.log(`Migration complete (${payload.backend}).`);
}

function printDefaultStatus(rest: readonly string[]): void {
  const json = hasFlag(rest, "--json");
  const payload = defaultProductDbStatus();
  if (json) console.log(JSON.stringify(payload));
  else console.log(JSON.stringify(payload, null, 2));
}

function runLocalStateResetPlan(rest: readonly string[]): void {
  const json = hasFlag(rest, "--json");
  const fulcrumHome = readFlag(rest, "--fulcrum-home") ?? process.env["FULCRUM_HOME"];
  if (!fulcrumHome) throw new Error("missing --fulcrum-home or FULCRUM_HOME for local reset");
  const payload = resetPlanForFulcrumHome(fulcrumHome, {
    confirm: hasFlag(rest, "--yes-reset-local-state"),
  });
  if (json) console.log(JSON.stringify(payload));
  else console.log(payload.message);
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
        await runExplicitProductMigrationCli(rest);
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

    case "reset-local-state": {
      runLocalStateResetPlan(rest);
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
