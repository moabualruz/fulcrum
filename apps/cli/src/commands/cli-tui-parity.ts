import { CLI_TUI_PARITY_MATRIX, type CliTuiParityRow } from "../cli-tui-parity.ts";
import { emitResult, type OutputIo } from "../lib/cli-output.ts";
import { wantsHelp } from "../lib/flag-conventions.ts";

const HELP = [
  "fulcrum parity cli-tui [--json]",
  "",
  "Print the CLI/TUI parity matrix from CLI-TUI-UX.md §13.",
  "",
  "Options:",
  "  --json        Output the fulcrum.cli.v1 envelope.",
  "  -h, --help    Show this help.",
].join("\n");

export interface CliTuiParityResult {
  rows: readonly CliTuiParityRow[];
}

export function renderCliTuiParityPlain(rows: readonly CliTuiParityRow[]): string {
  const lines = ["CLI/TUI parity matrix", "Stage | CLI | TUI route/key path"];
  for (const row of rows) {
    lines.push(`${row.stage} | ${row.cli} | ${row.tui} | keys: ${row.keyPath.join(" ")}`);
  }
  return lines.join("\n");
}

export async function run(argv: readonly string[], io: OutputIo = defaultIo()): Promise<void> {
  if (wantsHelp(argv)) {
    io.print(HELP);
    return;
  }

  const result: CliTuiParityResult = { rows: CLI_TUI_PARITY_MATRIX };
  emitResult(
    {
      argv,
      command: "fulcrum parity cli-tui",
      args: {},
      result,
      renderHuman: ({ rows }) => io.print(renderCliTuiParityPlain(rows)),
    },
    io,
  );
}

function defaultIo(): OutputIo {
  return {
    print: (line) => process.stdout.write(`${line}\n`),
    printErr: (line) => process.stderr.write(`${line}\n`),
  };
}

