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

/** Help text for the `db` subcommand. */
const HELP = `fulcrum db

Database management commands.

Usage:
  fulcrum db migrate [--target-version <version>] [--force]
  fulcrum db status
  fulcrum db history [--json]

Options:
  --target-version <v>  Migrate to specific version (name or numeric timestamp).
                        Omit to migrate to latest.
  --force               Allow lossy down-migrations.
  --json                Output as JSON (history command).
  -h, --help            Show this help.
`;

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
      const status = await dbStatus(container);
      console.log(JSON.stringify(status, null, 2));
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
