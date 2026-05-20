/**
 * `fulcrum artifact` — the Ship stage artifact verb group (CLI-TUI-UX.md §1.5).
 *
 * Re-homed under the Ship workflow stage: the canonical command is now
 * `fulcrum artifact <verb>` (and `fulcrum ship artifact <verb>` via the Ship
 * stage host), while the legacy `fulcrum artifacts` spelling is preserved as a
 * documented alias (CLI review fix A-CLI-001 — no command name removed without
 * an alias). Both spellings dispatch through this one `run` handler.
 *
 * Verb spelling matches `ship.html` and CLI-TUI-UX.md §1.5:
 *   list · view · diff · export · download   (canonical §1.5 verbs)
 *   show                                      (legacy alias for `view`)
 *   upload · accept · reject · archive · unarchive · delete (carried forward)
 *
 * Every `--json` invocation routes through the shared `emitResult` helper so the
 * output is the canonical `fulcrum.cli.v1` envelope (CLI-TUI-UX.md §3) — twelve
 * keys, `errors`/`next_actions` always arrays.
 */

import { apiErrorCode, formatApiError } from "../api-errors.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";
import {
  createArtifactApiCallerFromEnv,
  type ArtifactApiEnvironment,
} from "@workflow-coordination/interface/http/artifact-api-client.ts";

type ArtifactsCaller = {
  artifacts: {
    list(input: Record<string, unknown>): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    upload(input: Record<string, unknown>): Promise<unknown>;
    accept(input: { id: string }): Promise<unknown>;
    reject(input: { id: string }): Promise<unknown>;
    download(input: { id: string }): Promise<unknown>;
    archive(input: { id: string }): Promise<unknown>;
    unarchive(input: { id: string }): Promise<unknown>;
    delete(input: { id: string; hard?: boolean }): Promise<unknown>;
    /** Optional — release/artifact diff has no backing service yet. */
    diff?(input: { id: string; against: string }): Promise<unknown>;
    /** Optional — artifact export has no backing service yet. */
    export?(input: { id: string; out?: string }): Promise<unknown>;
  };
};

export interface ArtifactsRunOptions {
  caller?: ArtifactsCaller;
  env?: ArtifactApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

/**
 * The Ship stage artifact verbs (CLI-TUI-UX.md §1.5). The first five are the
 * canonical §1.5 spelling; `show` is the legacy alias for `view`; the rest are
 * carried-forward verbs preserved per the no-feature-loss migration rule.
 */
export const ARTIFACT_VERBS = [
  "list",
  "view",
  "diff",
  "export",
  "download",
  "show",
  "upload",
  "accept",
  "reject",
  "archive",
  "unarchive",
  "delete",
] as const;

export const ARTIFACTS_HELP = `fulcrum artifact — Ship stage artifact verbs

Usage:
  fulcrum artifact list      [--project-id <id>] [--run-id <id>] [--task-id <id>] [--archived] [--mime <type>] [--kind binary|spec|report|memory] [--json]
  fulcrum artifact view      <id> [--json]                       # alias: show
  fulcrum artifact diff      <id> --against <id> [--json]
  fulcrum artifact export    <id> [--out <path>] [--json]
  fulcrum artifact download  <id> [--json]
  fulcrum artifact upload    --filename <name> --mime <type> --size-bytes <n> [--project-id <id>] [--task-id <id>] [--run-id <id>] [--doc-id <id>] [--metadata <json>] [--json]
  fulcrum artifact accept    <id> [--json]
  fulcrum artifact reject    <id> [--json]
  fulcrum artifact archive   <id> [--json]
  fulcrum artifact unarchive <id> [--json]
  fulcrum artifact delete    <id> [--hard] [--json]

Re-homed under the Ship workflow stage. \`fulcrum artifacts\` is a documented
alias; \`fulcrum ship artifact <verb>\` is equivalent. \`--json\` emits the
canonical fulcrum.cli.v1 envelope (CLI-TUI-UX.md §3).
`;

/** Back-compat: `HELP` was the previous export name. */
const HELP = ARTIFACTS_HELP;

function isHelpVerb(verb: string): boolean {
  return verb === "help" || verb === "--help" || verb === "-h";
}

export async function run(argv: readonly string[], opts: ArtifactsRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [rawVerb = "help", ...rest] = argv;
  // `view` is the canonical §1.5 spelling; `show` is the legacy alias.
  const verb = rawVerb === "show" ? "view" : rawVerb;
  // The envelope `command` field always uses the canonical `artifact` noun.
  const command = `artifact ${verb}`;

  try {
    if (isHelpVerb(rawVerb)) {
      io.print(ARTIFACTS_HELP);
      return;
    }

    const caller = await resolveCaller(opts);
    switch (verb) {
      case "list":
        return emit(
          command,
          await caller.artifacts.list(compact({
            projectId: flagValue(rest, "--project-id"),
            runId: flagValue(rest, "--run-id"),
            taskId: flagValue(rest, "--task-id"),
            archived: rest.includes("--archived") ? true : undefined,
            mime: flagValue(rest, "--mime"),
            kind: flagValue(rest, "--kind"),
          })),
          rest,
          io,
        );
      case "view":
        return emit(
          command,
          await caller.artifacts.get({ id: requiredArg(rest, "view", "<id>") }),
          rest,
          io,
        );
      case "diff": {
        const id = requiredArg(rest, "diff", "<id>");
        const against = requiredFlag(rest, "--against", "diff");
        if (typeof caller.artifacts.diff !== "function") {
          return emitUnavailable(command, "diff", rest, io);
        }
        return emit(command, await caller.artifacts.diff({ id, against }), rest, io);
      }
      case "export": {
        const id = requiredArg(rest, "export", "<id>");
        if (typeof caller.artifacts.export !== "function") {
          return emitUnavailable(command, "export", rest, io);
        }
        return emit(
          command,
          await caller.artifacts.export({ id, out: flagValue(rest, "--out") }),
          rest,
          io,
        );
      }
      case "download":
        return emit(
          command,
          await caller.artifacts.download({ id: requiredArg(rest, "download", "<id>") }),
          rest,
          io,
        );
      case "upload":
        return emit(
          command,
          await caller.artifacts.upload(compact({
            filename: requiredFlag(rest, "--filename", "upload"),
            mime: requiredFlag(rest, "--mime", "upload"),
            sizeBytes: requiredFlag(rest, "--size-bytes", "upload"),
            projectId: flagValue(rest, "--project-id"),
            taskId: flagValue(rest, "--task-id"),
            runId: flagValue(rest, "--run-id"),
            docId: flagValue(rest, "--doc-id"),
            metadataJson: jsonFlag(rest, "--metadata"),
          })),
          rest,
          io,
        );
      case "accept":
        return emit(
          command,
          await caller.artifacts.accept({ id: requiredArg(rest, "accept", "<id>") }),
          rest,
          io,
        );
      case "reject":
        return emit(
          command,
          await caller.artifacts.reject({ id: requiredArg(rest, "reject", "<id>") }),
          rest,
          io,
        );
      case "archive":
        return emit(
          command,
          await caller.artifacts.archive({ id: requiredArg(rest, "archive", "<id>") }),
          rest,
          io,
        );
      case "unarchive":
        return emit(
          command,
          await caller.artifacts.unarchive({ id: requiredArg(rest, "unarchive", "<id>") }),
          rest,
          io,
        );
      case "delete":
        return emit(
          command,
          await caller.artifacts.delete({
            id: requiredArg(rest, "delete", "<id>"),
            hard: rest.includes("--hard") || undefined,
          }),
          rest,
          io,
        );
      default:
        io.printErr(`fulcrum artifact: unknown command '${rawVerb}'`);
        io.printErr(ARTIFACTS_HELP);
        io.exit(2);
        return;
    }
  } catch (error) {
    emitErrorResult(
      {
        argv: rest,
        command,
        error: {
          code: apiErrorCode(error) ?? "FUL_SHIP_ARTIFACT_FAILED",
          message: errorMessage(error),
          fix: "Check `fulcrum artifact help` and the artifact id, then retry.",
        },
        env: opts.env as NodeJS.ProcessEnv | undefined,
        renderHuman: () => io.printErr(`fulcrum artifact ${rawVerb}: ${errorMessage(error)}`),
      },
      io,
    );
    io.exit(1);
  }
}

/** Emit a command result through the canonical `fulcrum.cli.v1` envelope. */
function emit(
  command: string,
  result: unknown,
  argv: readonly string[],
  io: { print: (line: string) => void; printErr: (line: string) => void },
): void {
  emitResult(
    {
      argv,
      command,
      result,
      renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
    },
    io,
  );
}

/**
 * Emit a canonical error envelope for a verb whose backing service does not
 * exist yet (artifact `diff` / `export`). The verb is a real dispatchable
 * command — the envelope contract still holds; the error states the gap.
 */
function emitUnavailable(
  command: string,
  verb: "diff" | "export",
  argv: readonly string[],
  io: { print: (line: string) => void; printErr: (line: string) => void },
): void {
  emitErrorResult(
    {
      argv,
      command,
      error: {
        code: `FUL_SHIP_ARTIFACT_${verb.toUpperCase()}_UNAVAILABLE`,
        message: `\`fulcrum artifact ${verb}\` is not available — the artifact ${verb} service is not configured.`,
        fix: `Connect an artifact server that supports ${verb}, or use \`fulcrum artifact view\` to inspect the artifact.`,
      },
      renderHuman: () => {},
    },
    io,
  );
}

async function resolveCaller(opts: ArtifactsRunOptions): Promise<ArtifactsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createArtifactApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Artifact API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller as ArtifactsCaller;
}

function requiredArg(argv: readonly string[], command: string, label: string): string {
  const value = argv.find((arg) => !arg.startsWith("-"));
  if (!value) throw new Error(`missing required argument ${label} for ${command}`);
  return value;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function requiredFlag(argv: readonly string[], flag: string, command: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined) throw new Error(`fulcrum artifact ${command}: missing required flag ${flag}`);
  return value;
}

function jsonFlag(argv: readonly string[], flag: string): Record<string, unknown> | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected object");
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(`invalid ${flag} JSON: ${(err as Error).message}`);
  }
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}

export { HELP };
export type { ArtifactsCaller };
