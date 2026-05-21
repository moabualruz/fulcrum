import { CLI_TUI_PARITY_MATRIX, type CliTuiParityRow } from "@fulcrum/cli/cli-tui-parity.ts";
import { resolveColonRoute } from "./screen-registry.ts";

export interface TuiParityKeyPath {
  readonly cli: string;
  readonly route: string;
  readonly screenKey: string;
  readonly keyPath: readonly string[];
}

export function listTuiParityKeyPaths(): readonly TuiParityKeyPath[] {
  return CLI_TUI_PARITY_MATRIX.map((row) => {
    const screenKey = resolveCliTuiParityRoute(row);
    return {
      cli: row.cli,
      route: row.route,
      screenKey,
      keyPath: row.keyPath,
    };
  });
}

export function resolveCliTuiParityRoute(row: CliTuiParityRow): string {
  const route = row.route.replace(/<[^>]+>/g, "sample");
  const baseRoute = route.split("/")[0] ?? route;
  const resolved = resolveColonRoute(baseRoute);
  if (!resolved) {
    throw new Error(`CLI/TUI parity matrix route does not resolve: ${row.route} for ${row.cli}`);
  }
  return resolved;
}

