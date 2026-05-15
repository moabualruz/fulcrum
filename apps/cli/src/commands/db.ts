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
 * C6: No raw SQL.
 * C4: CLI surface at feature parity with Web surface.
 */

import { defaultProductDbStatus } from "@platform-core/application/db/commands.ts";
import { readSchemaHistory, readSchemaStatus, runSchemaMigration } from "@platform-core/application/db/schema-management.ts";
import { resetPlanForFulcrumHome } from "@platform-core/application/init/local-state.ts";

/** Help text for the `db` subcommand. */
const HELP = `fulcrum db

Database management commands.

Usage:
  fulcrum db migrate [--target-version <version>] [--force]
  fulcrum db status [--json]
  fulcrum db history [--json]
  fulcrum db reset-local-state --fulcrum-home <path> --yes-reset-local-state [--json]

Options:
  --target-version <v>  Migrate to specific version (name or numeric timestamp).
                        Omit to migrate to latest.
  --force               Allow lossy down-migrations.
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

function rejectRemovedBackendFlags(argv: readonly string[]): void {
  if (!argv.includes("--backend") && !argv.includes("--url")) return;
  throw new Error(
    "explicit database backend flags were removed from db migrate; use default PGlite via FULCRUM_HOME or configure FULCRUM_DATABASE_URL/DATABASE_URL for PostgreSQL",
  );
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
  container: { get<T>(token: new (...args: unknown[]) => T): T } | null = null,
): Promise<void> {
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "migrate": {
      rejectRemovedBackendFlags(rest);

      const targetVersionFlag = rest.indexOf("--target-version");
      const targetVersion =
        targetVersionFlag !== -1 ? rest[targetVersionFlag + 1] : undefined;
      const force = rest.includes("--force");

      await runSchemaMigration(container, {
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
      const status = await readSchemaStatus(container);
      console.log(hasFlag(rest, "--json") ? JSON.stringify(status) : JSON.stringify(status, null, 2));
      return;
    }

    case "history": {
      const history = await readSchemaHistory(container);
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
