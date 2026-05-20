/**
 * fulcrum mode — the CLI side of the universal per-Step ModeAffordance
 * (DESIGN.md §4.11, §4.13; CLI-TUI-UX.md §1).
 *
 * Every Step in the web shell (task card, doc block, review item, artifact
 * row, subsystem row, audit row) carries the `✋ Manual / ▶ Play / 💬 Discuss /
 * ⊞ AI Assist` mode row. `prd-web-mode-affordance-system` makes that affordance
 * universal across surfaces — this command is the CLI equivalent: a single
 * verb tree that applies any of the four modes to a Step from the terminal, so
 * a CLI operator shares the same Manual/Play/Discuss/AI-Assist mental model as
 * the web ModeAffordance and the TUI `ModePicker` row.
 *
 * Verbs (one per canonical mode):
 *   fulcrum mode manual  <step-id>                 Mark the Step worked manually.
 *   fulcrum mode play    <step-id> [--agent <id>]  Hand the Step off to an AI agent.
 *   fulcrum mode discuss <step-id> [--note <text>] Open the Step's comment thread.
 *   fulcrum mode ai      <step-id> [--agent <id>]  Open an AI Assist session on the Step.
 *   fulcrum mode list                              List the four canonical modes.
 *
 * Every verb accepts `--json` and emits the canonical `fulcrum.cli.v1` envelope
 * (`prd-cli-json-envelope-v1`); plain output carries the DESIGN.md §4.10 trace
 * header line so a moded Step is followable in web / TUI by the same trace id.
 */

import { emitResult } from "../lib/cli-output.ts";

/** A canonical workflow mode — the CLI mirror of the web `WorkflowMode`. */
export type ModeVerb = "manual" | "play" | "discuss" | "ai";

/**
 * The four canonical modes (DESIGN.md §4.13). `glyph` + `label` match the web
 * `ModeRow` primitive exactly so the surfaces never drift. `verb` is the CLI
 * subcommand; `webMode` is the `@fulcrum/ui-kit` `WorkflowMode` it corresponds
 * to (the web primitive names AI Assist `assist`).
 */
export const MODE_AFFORDANCES: ReadonlyArray<{
  verb: ModeVerb;
  webMode: "manual" | "play" | "discuss" | "assist";
  glyph: string;
  label: string;
  description: string;
}> = [
  { verb: "manual", webMode: "manual", glyph: "✋", label: "Manual", description: "Work the step yourself." },
  { verb: "play", webMode: "play", glyph: "▶", label: "Play", description: "Hand the step off to an AI agent." },
  { verb: "discuss", webMode: "discuss", glyph: "💬", label: "Discuss", description: "Open the step's comment thread." },
  { verb: "ai", webMode: "assist", glyph: "⊞", label: "AI Assist", description: "Open an AI Assist session scoped to the step." },
];

/** The CLI verbs that select a mode — used by help and dispatch. */
export const MODE_VERBS: readonly ModeVerb[] = MODE_AFFORDANCES.map((m) => m.verb);

export interface ModeCommandOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Process env — drives the CLI-TUI-UX §2.3 colour-disable + trace identity. */
  env?: NodeJS.ProcessEnv;
}

const HELP = `fulcrum mode — apply a per-step mode affordance

The CLI side of the universal Step ModeAffordance (DESIGN.md §4.11, §4.13).
Mode labels: ✋ Manual · ▶ Play · 💬 Discuss · ⊞ AI Assist.

Usage:
  fulcrum mode manual  <step-id> [--json]
  fulcrum mode play    <step-id> [--agent <id>] [--json]
  fulcrum mode discuss <step-id> [--note <text>] [--json]
  fulcrum mode ai      <step-id> [--agent <id>] [--json]
  fulcrum mode list    [--json]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope.
  --jq <expr>       Filter the envelope's .result through jq.
  -h, --help        Show this help.
`;

/** Read a `--flag value` pair out of argv; returns undefined when absent. */
function flagValue(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

/** The first non-flag positional in argv (the Step id). */
function positional(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg.startsWith("-")) {
      // Skip the value of known value-taking flags.
      if (["--agent", "--note", "--jq"].includes(arg)) i += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

/**
 * Entry point for `fulcrum mode <verb> [args]`. Mirrors the web ModeAffordance:
 * one verb per Manual/Play/Discuss/AI-Assist mode, applied to a Step id.
 */
export async function run(argv: readonly string[], opts: ModeCommandOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const env = opts.env ?? process.env;
  const [verb = "help", ...rest] = argv;

  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  if (verb === "list") {
    emitResult(
      {
        argv: rest,
        command: "fulcrum mode list",
        result: MODE_AFFORDANCES.map((m) => ({
          verb: m.verb,
          mode: m.webMode,
          label: m.label,
          glyph: m.glyph,
          description: m.description,
        })),
        env,
        renderHuman: (modes) => {
          io.print("Step mode affordances (DESIGN.md §4.13):");
          for (const m of modes) {
            io.print(`  ${m.glyph} ${m.label.padEnd(10)} fulcrum mode ${m.verb.padEnd(8)} — ${m.description}`);
          }
        },
      },
      io,
    );
    return;
  }

  const affordance = MODE_AFFORDANCES.find((m) => m.verb === verb);
  if (!affordance) {
    io.printErr(`fulcrum mode: unknown mode '${verb}' — expected one of ${MODE_VERBS.join(", ")}`);
    io.printErr(HELP);
    io.exit(2);
    return;
  }

  const stepId = positional(rest);
  if (!stepId) {
    io.printErr(`fulcrum mode ${verb}: missing required argument <step-id>`);
    io.printErr(`Usage: fulcrum mode ${verb} <step-id>`);
    io.exit(2);
    return;
  }

  const agent = flagValue(rest, "--agent");
  const note = flagValue(rest, "--note");

  // Applying a mode to a Step is a trace-bearing action — the envelope + the
  // plain trace header carry the SAME trace id so the moded Step is followable
  // across the web ModeAffordance, the TUI ModePicker, and the audit log.
  emitResult(
    {
      argv: rest,
      command: `fulcrum mode ${verb}`,
      result: {
        step: stepId,
        mode: affordance.webMode,
        verb: affordance.verb,
        label: affordance.label,
        glyph: affordance.glyph,
        ...(agent ? { agent } : {}),
        ...(note ? { note } : {}),
      },
      env,
      traceLine: true,
      renderHuman: (applied) => {
        io.print(`${applied.glyph} ${applied.label} — step ${applied.step}`);
        if (applied.agent) io.print(`  agent: ${applied.agent}`);
        if (applied.note) io.print(`  note: ${applied.note}`);
      },
    },
    io,
  );
}

export const runMode = run;
