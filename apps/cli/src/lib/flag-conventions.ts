/**
 * CLI flag conventions — the one shared codification of `CLI-TUI-UX.md` §2.
 *
 * `CLI-TUI-UX.md` §2 locks the cross-command flag grammar: a fixed set of
 * global flags every command accepts where applicable, a strict
 * flag > env > config > default precedence order, secrets that must never be
 * read from argv, the colour-disable conditions, and the Ctrl-C contract. This
 * module is the single source of truth for that grammar so no individual
 * command re-invents flag names, precedence, or secret handling.
 *
 * Scope — what lives here:
 *  - {@link GLOBAL_FLAGS} — the §2 cross-cutting flag registry (name, behavior).
 *  - {@link isGlobalFlag} / {@link splitGlobalFlags} — recognise §2 flags in argv.
 *  - {@link resolveWithPrecedence} — the §2.2 flag > env > config > default chain.
 *  - {@link isSecretFlag} / {@link assertNoSecretInArgv} — §2.1 secrets handling:
 *    secrets never come from argv; the safe carriers are env / `--token-file` /
 *    `--token-stdin`.
 *  - {@link isColorDisabled} — the §2.3 colour-disable conditions.
 *  - {@link CTRL_C_FIRST_INTERRUPT_MESSAGE} — the §2.4 first-INT copy.
 *  - {@link redactArgvForJson} — make an `args` map safe for the `--json`
 *    envelope and for error text, so a secret value can never leak.
 *
 * Colour detection re-exports `isColorEnabled` from `trace-line.ts` — that
 * module already implements the §2.3 list; this module is its sibling for the
 * non-colour parts of §2 and keeps the two in one import surface.
 */

import { REDACTED_PLACEHOLDER } from "@platform-core/application/log-redaction/redactor.ts";

import { isColorEnabled } from "./trace-line.ts";

// ─────────────────────────────────────────────────────────────────────────────
// §2 — global flag registry
// ─────────────────────────────────────────────────────────────────────────────

/** One entry of the `CLI-TUI-UX.md` §2 cross-cutting flag table. */
export interface GlobalFlagSpec {
  /** Long form, e.g. `--json`. Always present. */
  readonly long: string;
  /** Short alias, e.g. `-h`, when §2 defines one. */
  readonly short?: string;
  /** Whether the flag takes a value (`--profile <name>`) or is a boolean. */
  readonly takesValue: boolean;
  /** One-line behavior, matching `CLI-TUI-UX.md` §2 wording. */
  readonly help: string;
}

/**
 * The `CLI-TUI-UX.md` §2 cross-cutting flag table. Every command accepts these
 * where applicable; help text is the §2 wording so `fulcrum help` and
 * per-command help stay consistent.
 *
 * Beyond the §2 table this also carries `--agent` / `--all-agents` (§1.8
 * per-agent scoping) and `--no-input`, which §2 lists for non-interactive runs.
 */
export const GLOBAL_FLAGS: readonly GlobalFlagSpec[] = [
  { long: "--help", short: "-h", takesValue: false, help: "Show help. Always works, even after other flags." },
  { long: "--version", short: "-V", takesValue: false, help: "Print version, commit, and build date." },
  { long: "--json", takesValue: false, help: "JSON envelope output (fulcrum.cli.v1)." },
  { long: "--jq", takesValue: true, help: "Apply a jq expression to the JSON result." },
  { long: "--template", takesValue: true, help: "Render JSON output through a Go template." },
  { long: "--plain", takesValue: false, help: "Tabular text for grep / awk." },
  { long: "--quiet", short: "-q", takesValue: false, help: "Suppress non-error output." },
  { long: "--verbose", short: "-v", takesValue: false, help: "Increase verbosity (repeat for more)." },
  { long: "--debug", takesValue: false, help: "Full debug logs to stderr." },
  { long: "--no-color", takesValue: false, help: "Disable colour (also NO_COLOR=, FULCRUM_NO_COLOR=)." },
  { long: "--no-input", takesValue: false, help: "Disable every prompt; fail if data is missing." },
  { long: "--dry-run", short: "-n", takesValue: false, help: "Show what would happen without doing it." },
  { long: "--force", short: "-f", takesValue: false, help: "Skip confirmation for moderate-danger actions." },
  { long: "--confirm", takesValue: true, help: "Required for severe actions (drop run, purge memory)." },
  { long: "--repo", short: "-R", takesValue: true, help: "Override the project scope." },
  { long: "--profile", takesValue: true, help: "Override the workspace profile." },
  { long: "--output", short: "-o", takesValue: true, help: "Output format: pretty|json|jsonl|yaml|table|wide|name." },
  { long: "--watch", short: "-w", takesValue: false, help: "Stream until Ctrl-C." },
  { long: "--follow", takesValue: false, help: "Tail mode (logs)." },
  { long: "--since", takesValue: true, help: "Time filter start (ISO 8601 or relative, e.g. 1h)." },
  { long: "--until", takesValue: true, help: "Time filter end." },
  { long: "--limit", takesValue: true, help: "Cap the number of output rows." },
  { long: "--web", takesValue: false, help: "Open in a browser instead of returning data." },
  { long: "--agent", takesValue: true, help: "Scope the command to a single agent." },
  { long: "--all-agents", takesValue: false, help: "Apply the command across every agent." },
] as const;

/** Long-form lookup of every §2 global flag. */
const GLOBAL_FLAG_BY_LONG: ReadonlyMap<string, GlobalFlagSpec> = new Map(
  GLOBAL_FLAGS.map((flag) => [flag.long, flag]),
);

/** Short-form lookup of every §2 global flag that defines a short alias. */
const GLOBAL_FLAG_BY_SHORT: ReadonlyMap<string, GlobalFlagSpec> = new Map(
  GLOBAL_FLAGS.filter((flag): flag is GlobalFlagSpec & { short: string } => Boolean(flag.short)).map(
    (flag) => [flag.short, flag],
  ),
);

/** Resolve a `CLI-TUI-UX.md` §2 global flag by its long or short token. */
export function findGlobalFlag(token: string): GlobalFlagSpec | undefined {
  return GLOBAL_FLAG_BY_LONG.get(token) ?? GLOBAL_FLAG_BY_SHORT.get(token);
}

/** True when `token` is a documented `CLI-TUI-UX.md` §2 global flag. */
export function isGlobalFlag(token: string): boolean {
  return findGlobalFlag(token) !== undefined;
}

/** The set of §2 global flags that are booleans (no value follows). */
export const GLOBAL_BOOLEAN_FLAGS: ReadonlySet<string> = new Set(
  GLOBAL_FLAGS.filter((flag) => !flag.takesValue).map((flag) => flag.long),
);

/** Result of {@link splitGlobalFlags} — §2 global flags vs the command's own argv. */
export interface SplitArgv {
  /** Tokens recognised as §2 global flags (and their values). */
  global: string[];
  /** Every remaining token — the command's own positionals and flags. */
  rest: string[];
}

/**
 * Partition raw argv into the `CLI-TUI-UX.md` §2 global flags and the rest.
 *
 * Every command can hand its argv through this and get a uniform read of the
 * global flags without re-listing them. A `--` token stops global-flag parsing,
 * matching `arg-parser.ts` — everything after `--` is a positional.
 */
export function splitGlobalFlags(argv: readonly string[]): SplitArgv {
  const global: string[] = [];
  const rest: string[] = [];
  let stop = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (stop) {
      rest.push(token);
      continue;
    }
    if (token === "--") {
      stop = true;
      rest.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const bare = eq === -1 ? token : token.slice(0, eq);
    const spec = findGlobalFlag(bare);
    if (!spec) {
      rest.push(token);
      continue;
    }
    global.push(token);
    // A value-taking global flag in `--flag value` form consumes the next token.
    if (spec.takesValue && eq === -1) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        global.push(next);
        i += 1;
      }
    }
  }
  return { global, rest };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.2 — config precedence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `CLI-TUI-UX.md` §2.2 precedence layers, highest first. A resolver walks
 * this order and returns the first defined value.
 */
export const PRECEDENCE_ORDER = ["flag", "env", "projectConfig", "userConfig", "systemConfig", "default"] as const;

/** One layer of the §2.2 precedence chain. */
export type PrecedenceLayer = (typeof PRECEDENCE_ORDER)[number];

/** Candidate values for one setting, keyed by §2.2 precedence layer. */
export type PrecedenceCandidates<T> = Partial<Record<PrecedenceLayer, T | undefined>>;

/** Result of {@link resolveWithPrecedence}: the winning value and its layer. */
export interface PrecedenceResolution<T> {
  /** The resolved value, or `undefined` when no layer supplied one. */
  value: T | undefined;
  /** Which §2.2 layer the value came from, or `undefined` when none did. */
  source: PrecedenceLayer | undefined;
}

/**
 * Resolve a setting through the `CLI-TUI-UX.md` §2.2 precedence chain.
 *
 * Order, highest → lowest: flag (argv) > env (`FULCRUM_*`) > project config
 * (`.fulcrum.toml`) > user config (`~/.config/fulcrum/config.toml`) > system
 * config (`/etc/fulcrum/config.toml`) > built-in default. The first layer with
 * a non-`undefined` value wins; the resolution names which layer it was so a
 * caller can show provenance (`--debug`).
 */
export function resolveWithPrecedence<T>(candidates: PrecedenceCandidates<T>): PrecedenceResolution<T> {
  for (const layer of PRECEDENCE_ORDER) {
    const candidate = candidates[layer];
    if (candidate !== undefined) {
      return { value: candidate, source: layer };
    }
  }
  return { value: undefined, source: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.1 — secrets handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flags that would carry a secret on argv. `CLI-TUI-UX.md` §2.1 forbids these:
 * a process table leaks argv globally. The safe carriers are the env var, a
 * `--token-file <path>`, or stdin (`--token-stdin`).
 */
export const FORBIDDEN_SECRET_FLAGS: readonly string[] = ["--token", "--password", "--secret", "--api-key"] as const;

/** The §2.1 safe secret carriers — used in the recovery message. */
export const SAFE_SECRET_CARRIERS: readonly string[] = [
  "FULCRUM_TOKEN env var",
  "--token-file <path>",
  "--token-stdin",
] as const;

/** True when `token` (long form, before any `=`) is a §2.1 forbidden secret flag. */
export function isSecretFlag(token: string): boolean {
  const bare = token.startsWith("-") ? token.split("=")[0] : token;
  return FORBIDDEN_SECRET_FLAGS.includes(bare as (typeof FORBIDDEN_SECRET_FLAGS)[number]);
}

/** Thrown when a secret is passed on argv — the §2.1 violation. */
export class SecretInArgvError extends Error {
  /** Namespaced code for the `fulcrum.cli.v1` error envelope (`CLI-TUI-UX.md` §3.1). */
  readonly code = "FUL_CLI_SECRET_IN_ARGV";
  /** The recovery action, surfaced as the envelope error `fix`. */
  readonly fix: string;
  constructor(flag: string) {
    super(
      `Refusing to read a secret from a command-line flag (${flag}). ` +
        `argv is visible in the process table. Pass the secret via the ${SAFE_SECRET_CARRIERS[0]}, ` +
        `${SAFE_SECRET_CARRIERS[1]}, or ${SAFE_SECRET_CARRIERS[2]} instead.`,
    );
    this.name = "SecretInArgvError";
    this.fix = `Use the ${SAFE_SECRET_CARRIERS[0]} or ${SAFE_SECRET_CARRIERS[1]} instead of ${flag}.`;
  }
}

/**
 * Enforce `CLI-TUI-UX.md` §2.1: scan argv and throw {@link SecretInArgvError}
 * if any forbidden secret flag is present. A secret/config mutating command
 * calls this before doing anything, so a secret never travels on argv and never
 * reaches an error message or the `--json` envelope.
 */
export function assertNoSecretInArgv(argv: readonly string[]): void {
  for (const token of argv) {
    if (isSecretFlag(token)) {
      // Use only the flag *name* in the error — never the value after `=`.
      const flagName = token.startsWith("-") ? (token.split("=")[0] as string) : token;
      throw new SecretInArgvError(flagName);
    }
  }
}

/**
 * Redact an `args` map before it goes into the `--json` envelope or an error.
 *
 * Any key that names a secret flag (`--token`, `--password`, …) has its value
 * replaced with the redaction placeholder. This guards the envelope `args`
 * field — even if a command echoes its argv, a secret value never serialises.
 */
export function redactArgvForJson(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = isSecretFlag(key) ? REDACTED_PLACEHOLDER : value;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.3 — colour disable
// ─────────────────────────────────────────────────────────────────────────────

/** Re-export the §2.3 colour resolver so all of §2 is one import surface. */
export { isColorEnabled };

/**
 * The inverse of {@link isColorEnabled}: true when colour MUST be disabled per
 * `CLI-TUI-UX.md` §2.3 — any of: stdout/stderr not a TTY, `--no-color`,
 * `NO_COLOR` set (any value), `FULCRUM_NO_COLOR` set, or `TERM=dumb`.
 */
export function isColorDisabled(ctx: Parameters<typeof isColorEnabled>[0] = {}): boolean {
  return !isColorEnabled(ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.4 — Ctrl-C
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `CLI-TUI-UX.md` §2.4 message printed on the FIRST SIGINT. A second INT
 * skips cleanup and force-exits.
 */
export const CTRL_C_FIRST_INTERRUPT_MESSAGE =
  "Gracefully stopping… (press Ctrl+C again to force)" as const;

/** Outcome of one SIGINT, per `CLI-TUI-UX.md` §2.4. */
export interface InterruptOutcome {
  /** The message to print on this interrupt, or `undefined` on the force exit. */
  message: string | undefined;
  /** `true` once a second INT has been seen — the caller should force-exit. */
  force: boolean;
}

/**
 * Stateful Ctrl-C handler implementing `CLI-TUI-UX.md` §2.4.
 *
 * First SIGINT: returns the graceful-stop message, `force: false` — the command
 * should begin a fast, best-effort cleanup (a watching command also sends a
 * `session/cancel` notification). Second SIGINT: returns `force: true`, no
 * message — the command should exit immediately, skipping cleanup.
 */
export function createInterruptHandler(): { onInterrupt: () => InterruptOutcome } {
  let interrupts = 0;
  return {
    onInterrupt(): InterruptOutcome {
      interrupts += 1;
      if (interrupts === 1) {
        return { message: CTRL_C_FIRST_INTERRUPT_MESSAGE, force: false };
      }
      return { message: undefined, force: true };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Help rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render the `CLI-TUI-UX.md` §2 global-flags help block — the shared text any
 * command's `--help` can append so the global flag grammar reads identically
 * everywhere. `--help` must work even after other flags (the §2 invariant);
 * callers check {@link wantsHelp} first.
 */
export function renderGlobalFlagsHelp(): string {
  const lines = ["Global flags (CLI-TUI-UX.md §2):"];
  for (const flag of GLOBAL_FLAGS) {
    const token = flag.short ? `${flag.short}, ${flag.long}` : `    ${flag.long}`;
    const name = flag.takesValue ? `${token} <value>` : token;
    lines.push(`  ${name.padEnd(28)} ${flag.help}`);
  }
  return lines.join("\n");
}

/**
 * True when argv requests help — `-h` / `--help` anywhere in argv.
 *
 * `CLI-TUI-UX.md` §2 locks "`--help` always works, even after other flags", so
 * this scans the WHOLE argv, not just the first token.
 */
export function wantsHelp(argv: readonly string[]): boolean {
  return argv.some((token) => {
    const bare = token.indexOf("=") === -1 ? token : token.slice(0, token.indexOf("="));
    return bare === "--help" || bare === "-h";
  });
}

/** True when argv requests the version — `-V` / `--version` anywhere in argv. */
export function wantsVersion(argv: readonly string[]): boolean {
  return argv.some((token) => token === "--version" || token === "-V");
}
