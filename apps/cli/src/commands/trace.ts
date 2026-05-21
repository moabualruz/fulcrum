/**
 * `fulcrum trace show <id>` — the CLI trace resolver (CLI-TUI-UX.md §1.6).
 *
 * The trace id is the cross-surface primitive (DESIGN.md §4.10): the same id a
 * `--json` envelope carries, the web Trace-ID badge shows, and the TUI status
 * footer prints. `agent-cli-review.md` A-CLI-003 flagged that there was *no*
 * `fulcrum trace show <id>` anywhere in CLI dispatch despite CLI-TUI-UX.md:197
 * and IA-MAP.md §11 specifying it. This file owns that command — single
 * placement, not also in `prd-cli-trace-spine-v1` (which owns the trace-line
 * formatter, not the `trace` verb).
 *
 * `fulcrum trace show <id>` resolves a trace id into the run / span / audit
 * surfaces it links so an operator (or agent) can jump between web, TUI, audit
 * log, and CLI by one id. The trace store / span index is a placeholder layer
 * (AGENTS.md "Where we are going" — agent runs are not built yet), so this
 * command does not fabricate run/span rows: it emits the canonical
 * `fulcrum.cli.v1` envelope whose `result` names the resolved trace identity
 * and the canonical cross-surface links (`fulcrum audit list --trace <id>`,
 * the web `/operate/audit?trace=<id>` route, the TUI `:audit` screen), with
 * `next_actions` pointing at the backed audit surface. No production mocks.
 */

import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

/** Output sink — defaults bind to the process streams. */
interface TraceIo {
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
}

export interface TraceRunOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  env?: NodeJS.ProcessEnv;
}

/** The verbs the `trace` noun supports (CLI-TUI-UX.md §1.6). */
export const TRACE_VERBS = ["show"] as const;
export type TraceVerb = (typeof TRACE_VERBS)[number];

export const TRACE_HELP = `fulcrum trace — cross-surface trace resolver (CLI-TUI-UX.md §1.6)

A trace id ties one run together across web, TUI, audit log, and CLI
(DESIGN.md §4.10). \`trace show\` resolves an id to the surfaces it links.

Usage:
  fulcrum trace show <id> [--json]     Resolve a trace id to its run/span/audit links.

\`--json\` emits the canonical fulcrum.cli.v1 envelope (CLI-TUI-UX.md §3).`;

/** A 32-char lowercase-hex trace id, optionally with a short `tr_` style prefix. */
const TRACE_ID_PATTERN = /^(tr_)?[0-9a-f]{8,32}$/i;

function isHelpVerb(verb: string | undefined): boolean {
  return verb === undefined || verb === "help" || verb === "--help" || verb === "-h";
}

/**
 * The canonical cross-surface links a resolved trace id points at. These are
 * the *real* surfaces — the audit log is backed today; the web/TUI routes are
 * the documented IA-MAP.md §2.6 / §11 destinations a trace id resolves into.
 */
function traceLinks(traceId: string): {
  surface: string;
  description: string;
  command_or_route: string;
}[] {
  return [
    {
      surface: "audit",
      description: "Audit-log events recorded under this trace.",
      command_or_route: `fulcrum audit list --trace ${traceId}`,
    },
    {
      surface: "web",
      description: "Operate · Audit route filtered to this trace.",
      command_or_route: `/operate/audit?trace=${traceId}`,
    },
    {
      surface: "tui",
      description: "TUI Audit screen, trace-filtered.",
      command_or_route: `:audit --trace ${traceId}`,
    },
  ];
}

/**
 * `fulcrum trace show <id>` — resolve a trace id to its run / span / audit
 * links and emit the canonical envelope.
 */
function runTraceShow(rest: readonly string[], io: TraceIo, opts: TraceRunOptions): void {
  const id = rest.find((arg) => !arg.startsWith("-"));
  if (!id) {
    emitErrorResult(
      {
        argv: rest,
        command: "trace show",
        error: {
          code: "FUL_TRACE_MISSING_ID",
          message: "`fulcrum trace show` requires a trace id.",
          fix: "Pass the trace id from any envelope or status line: `fulcrum trace show <id>`.",
          doc: "CLI-TUI-UX.md §1.6",
        },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }
  if (!TRACE_ID_PATTERN.test(id)) {
    emitErrorResult(
      {
        argv: rest,
        command: "trace show",
        error: {
          code: "FUL_TRACE_INVALID_ID",
          message: `'${id}' is not a valid trace id.`,
          fix: "Trace ids are 8–32 hex chars (the value `trace=` prints in any envelope or status line).",
          doc: "DESIGN.md §4.10",
        },
        env: opts.env,
        renderHuman: () => {},
      },
      io,
    );
    return;
  }

  const normalized = id.toLowerCase();
  const links = traceLinks(normalized);
  emitResult(
    {
      argv: rest,
      command: "trace show",
      // The envelope's own `trace_id` stays the canonical 32-char invocation
      // id (honouring `FULCRUM_TRACE_ID`); the *resolved* trace id the operator
      // asked about is reported in `result.trace_id` — they are distinct ids.
      result: {
        stage: "operate",
        surface: "trace",
        trace_id: normalized,
        // The run/span index is a placeholder layer (AGENTS.md "Where we are
        // going"); the resolver does not fabricate run/span rows. It returns
        // the canonical cross-surface links a trace id resolves into.
        runs: [],
        spans: [],
        links,
        message:
          "Trace resolved to its cross-surface links. The run/span index is not yet " +
          "available locally — inspect this trace's recorded events via the audit log.",
      },
      next_actions: [
        { label: "Show audit events for this trace", command: `fulcrum audit list --trace ${normalized}` },
      ],
      env: opts.env,
      traceLine: true,
      renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
    },
    io,
  );
}

/**
 * Dispatch a `fulcrum trace` invocation. `argv[0]` is the verb (`show`); a
 * missing or help verb prints `TRACE_HELP`.
 */
export async function run(argv: readonly string[], opts: TraceRunOptions = {}): Promise<void> {
  const io: TraceIo = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb, ...rest] = argv;

  if (isHelpVerb(verb)) {
    io.print(TRACE_HELP);
    return;
  }

  if (verb === "show") {
    runTraceShow(rest, io, opts);
    return;
  }

  io.printErr(`fulcrum trace: unknown command '${verb}'`);
  io.printErr(TRACE_HELP);
  io.exit(2);
}
