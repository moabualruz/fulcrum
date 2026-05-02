/**
 * CLI: fulcrum symphony status [--json]
 *
 * Pillar 3, slice 11 — surface parity (CLI).
 * Calls orchestration.getOrchestratorStatus tRPC procedure.
 */

const HELP = `fulcrum symphony

Usage:
  fulcrum symphony status [--json]
`;

export interface SymphonyCliDeps {
  trpcCall: <T>(procedure: string, input: unknown) => Promise<T>;
  orgId: string;
}

interface OrchestratorStatus {
  running: number;
  queued: number;
  stalled: number;
}

export async function symphonyCommand(
  args: string[],
  deps: SymphonyCliDeps,
): Promise<string> {
  const subcommand = args[0];
  const isJson = args.includes("--json");

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    return HELP;
  }

  if (subcommand === "status") {
    const status = await deps.trpcCall<OrchestratorStatus>(
      "orchestration.getOrchestratorStatus",
      { orgId: deps.orgId },
    );

    if (isJson) {
      return JSON.stringify(status, null, 2);
    }

    return [
      "Symphony Orchestrator Status",
      "─".repeat(30),
      `  Running: ${status.running}`,
      `  Queued:  ${status.queued}`,
      `  Stalled: ${status.stalled}`,
    ].join("\n");
  }

  return `Unknown subcommand: ${subcommand}\n${HELP}`;
}
