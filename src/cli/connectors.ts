/**
 * CLI: fulcrum connectors list [--json]
 *      fulcrum connectors runs <kind> [--json]
 */

import type { ConnectorRunRow } from "../product-kernel/store/settings-connectors-credentials.ts";

export interface ConnectorSummary {
  kind: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

export function formatConnectorsList(connectors: ConnectorSummary[], json: boolean): string {
  if (json) return JSON.stringify(connectors, null, 2);
  if (connectors.length === 0) return "No connectors configured.";
  return connectors
    .map((c) => `${c.kind}  ${c.enabled ? "ON" : "OFF"}  last-sync: ${c.lastSyncAt ?? "never"}`)
    .join("\n");
}

export function formatConnectorRuns(runs: ConnectorRunRow[], json: boolean): string {
  if (json) return JSON.stringify(runs, null, 2);
  if (runs.length === 0) return "No runs found.";
  return runs
    .map((r) => `${r.kind}  ${r.status}  ${r.started_at}  ${r.records_synced} records  ${r.error ?? ""}`.trimEnd())
    .join("\n");
}

export async function run(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const isJson = rest.includes("--json");

  switch (sub) {
    case "list": {
      // In a full implementation, would read from DB. Stub for CLI surface.
      console.log(formatConnectorsList([], isJson));
      return;
    }
    case "runs": {
      const kind = rest.find((a) => !a.startsWith("--"));
      if (!kind) {
        console.error("usage: fulcrum connectors runs <kind> [--json]");
        process.exit(2);
      }
      // Stub — full implementation reads from product kernel DB
      console.log(formatConnectorRuns([], isJson));
      return;
    }
    default:
      console.error("usage: fulcrum connectors <list|runs> [--json]");
      process.exit(2);
  }
}
