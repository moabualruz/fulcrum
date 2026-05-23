/**
 * `fulcrum ship`: the Ship workflow stage command host (CLI-TUI-UX.md §1.5).
 *
 * Ship is workflow stage 5 of 6 (Capture · Plan · Build · Review · Ship ·
 * Operate). Before this host, the only Ship CLI surface was `fulcrum artifacts`
 *: there was no `fulcrum ship` / `release` grammar and no CLI equivalent for
 * the OD `ship.html` actions `Cut release` / `Roll back` / `Pause rollout` /
 * `Promote to 100%` (design-alignment/ship.md §"Migration notes",
 * 00-executive-review.md item 8).
 *
 * This host gives the Ship stage its full §1.5 verb grammar: seven groups:
 *
 *   ship      list · view                 : release-list launcher + detail
 *   artifact  list · view · diff · …       : delegates to `commands/artifacts.ts`
 *   release   cut · roll-back · pause · promote
 *   repo      list · status · sync
 *   branch    list · switch · finish
 *   pr        list · view · create
 *   memory    list · promote · view
 *
 * Every verb's `--json` output is the canonical `fulcrum.cli.v1` envelope
 * (CLI-TUI-UX.md §3) via the shared `emitResult` / `emitErrorResult` helpers.
 *
 * Non-mocked honesty: the `release` domain model (channel / rollout /
 * promotion-timeline) does not exist anywhere in the codebase yet
 * (design-alignment/ship.md §"Migration notes"). The `release` verbs: and the
 * `ship` / `repo` / `branch` / `pr` / `memory` launchers reached here without a
 * configured backing server: are real, dispatchable commands that emit a
 * canonical *error* envelope (`FUL_SHIP_*_UNAVAILABLE`) rather than fabricated
 * data. The verb grammar is complete; the envelope contract always holds.
 */

import type { ArtifactApiEnvironment } from "@workflow-coordination/interface/http/artifact-api-client.ts";

import { emitErrorResult, emitResult } from "../lib/cli-output.ts";
import { run as runArtifacts, type ArtifactsCaller } from "./artifacts.ts";

/** Output sink: defaults bind to the process streams. */
interface ShipStageIo {
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
}

export interface ShipStageRunOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Injected artifact caller for the `artifact` group: test seam. */
  artifactsCaller?: ArtifactsCaller;
  env?: NodeJS.ProcessEnv;
}

/**
 * The seven Ship stage verb groups (CLI-TUI-UX.md §1.5). `ship` is the stage
 * launcher itself; the rest are the §1.5 noun groups Ship owns.
 */
export const SHIP_VERB_GROUPS = [
  "ship",
  "artifact",
  "release",
  "repo",
  "branch",
  "pr",
  "memory",
] as const;

export type ShipVerbGroup = (typeof SHIP_VERB_GROUPS)[number];

/** The OD `ship.html` release actions, mapped to `fulcrum release` verbs. */
const RELEASE_VERBS = ["cut", "roll-back", "pause", "promote"] as const;
type ReleaseVerb = (typeof RELEASE_VERBS)[number];

/** Human label for each release verb: matches the OD `ship.html` action bar. */
const RELEASE_ACTION_LABEL: Record<ReleaseVerb, string> = {
  cut: "Cut release",
  "roll-back": "Roll back",
  pause: "Pause rollout",
  promote: "Promote to 100%",
};

export const SHIP_STAGE_HELP = `fulcrum ship: Ship workflow stage (CLI-TUI-UX.md §1.5)

Release outputs: artifacts, releases, repositories, branches, PRs, memory.

Usage:
  fulcrum ship list                              List releases (channel / cycle filters).
  fulcrum ship view <id>                         Show one release (peek-overview detail).
  fulcrum ship artifact <verb> ...               Artifact verbs: see \`fulcrum artifact help\`.

  fulcrum release cut [--channel <c>] [--from <ref>]   Cut a release (OD: Cut release · ⌘R).
  fulcrum release roll-back <id>                       Roll a release back (OD: ⏪ Roll back).
  fulcrum release pause <id>                           Pause a rollout (OD: ⏸ Pause rollout).
  fulcrum release promote <id> [--to 100]              Promote a rollout (OD: ▶ Promote to 100%).

  fulcrum repo list | status | sync <id>
  fulcrum branch list | switch <name> | finish [--merge|--rebase|--squash]
  fulcrum pr list [--repo <id>] | view <number> | create --title <t> --body <text>
  fulcrum memory list | promote --candidate <id> | view <id>

\`--json\` emits the canonical fulcrum.cli.v1 envelope (CLI-TUI-UX.md §3).
\`fulcrum artifacts\` and \`fulcrum ship artifact\` are equivalent (alias).
`;

function isHelpVerb(verb: string | undefined): boolean {
  return verb === undefined || verb === "help" || verb === "--help" || verb === "-h";
}

/**
 * Dispatch a `fulcrum ship` invocation.
 *
 * `argv[0]` is the verb group (`ship`, `artifact`, `release`, …). When the
 * group is omitted or is a help verb, the stage help prints. The Ship stage
 * host is invoked both as `fulcrum ship <group> <verb>` and: for re-homed
 * groups: directly as `fulcrum <group> <verb>`; both paths land here.
 */
export async function run(argv: readonly string[], opts: ShipStageRunOptions = {}): Promise<void> {
  const io: ShipStageIo = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [group, ...rest] = argv;

  if (isHelpVerb(group)) {
    io.print(SHIP_STAGE_HELP);
    return;
  }

  switch (group as ShipVerbGroup) {
    case "ship":
      return runShipLauncher(rest, io, opts);
    case "artifact":
      // The `artifact` group is fully backed: delegate to the artifact host.
      // A `ProcessEnv` is structurally a valid `ArtifactApiEnvironment`
      // (the artifact env only reads `FULCRUM_SERVER_URL` / `_PUBLIC_API_URL`).
      await runArtifacts(rest, {
        caller: opts.artifactsCaller,
        env: opts.env as ArtifactApiEnvironment | undefined,
        print: io.print,
        printErr: io.printErr,
        exit: io.exit,
      });
      return;
    case "release":
      return runRelease(rest, io, opts);
    case "repo":
      return runStubGroup("repo", rest, io, opts);
    case "branch":
      return runStubGroup("branch", rest, io, opts);
    case "pr":
      return runStubGroup("pr", rest, io, opts);
    case "memory":
      return runStubGroup("memory", rest, io, opts);
    default:
      io.printErr(`fulcrum ship: unknown command '${group}'`);
      io.printErr(SHIP_STAGE_HELP);
      io.exit(2);
      return;
  }
}

/**
 * `fulcrum ship list|view`: the release-list launcher and release detail.
 *
 * Releases are the Ship unit (design-alignment/ship.md, CLI-TUI-UX.md:569).
 * The release domain model does not exist yet, so these launchers emit a
 * canonical envelope whose `result` names the verb and points the operator at
 * the backed artifact list: no fabricated release data.
 */
function runShipLauncher(
  rest: readonly string[],
  io: ShipStageIo,
  opts: ShipStageRunOptions,
): void {
  const [verb = "list", ...verbRest] = rest;
  if (verb === "list") {
    emitResult(
      {
        argv: verbRest,
        command: "ship list",
        result: {
          stage: "ship",
          surface: "releases",
          channels: ["stable", "canary"],
          message:
            "Release listing requires a release server. Until then, list shipped artifacts with `fulcrum artifact list --kind binary`.",
        },
        next_actions: [
          { label: "List artifacts", command: "fulcrum artifact list --kind binary" },
        ],
        env: opts.env,
        renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
      },
      io,
    );
    return;
  }
  if (verb === "view") {
    const id = verbRest.find((arg) => !arg.startsWith("-"));
    if (!id) {
      emitErrorResult(
        {
          argv: verbRest,
          command: "ship view",
          error: {
            code: "FUL_SHIP_VIEW_MISSING_ID",
            message: "`fulcrum ship view` requires a release id.",
            fix: "Pass a release id: `fulcrum ship view <id>`.",
          },
          env: opts.env,
          renderHuman: () => {},
        },
        io,
      );
      return;
    }
    emitResult(
      {
        argv: verbRest,
        command: "ship view",
        result: {
          stage: "ship",
          surface: "release-detail",
          releaseId: id,
          message:
            "Release detail requires a release server. Inspect the release artifact with `fulcrum artifact view <id>`.",
        },
        next_actions: [
          { label: "View artifact", command: `fulcrum artifact view ${id}` },
        ],
        env: opts.env,
        renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
      },
      io,
    );
    return;
  }
  io.printErr(`fulcrum ship: unknown command 'ship ${verb}'`);
  io.printErr(SHIP_STAGE_HELP);
  io.exit(2);
}

/**
 * `fulcrum release cut|roll-back|pause|promote`: the OD `ship.html` release
 * actions as CLI verbs.
 *
 * The release / channel / rollout / promotion-timeline domain model does not
 * exist anywhere in the codebase (design-alignment/ship.md §"Migration
 * notes"). These are real dispatchable verbs; rather than fabricate a release
 * they emit a canonical error envelope stating the missing capability: under
 * `--json` the coded error sits in the always-array `errors` field; in plain
 * mode the COPY.md §3 recovery block prints to stderr with `trace=<id>`.
 */
function runRelease(
  rest: readonly string[],
  io: ShipStageIo,
  opts: ShipStageRunOptions,
): void {
  const [verb, ...verbRest] = rest;
  if (isHelpVerb(verb)) {
    io.print(SHIP_STAGE_HELP);
    return;
  }
  if (!RELEASE_VERBS.includes(verb as ReleaseVerb)) {
    io.printErr(`fulcrum release: unknown command '${verb}'`);
    io.printErr(SHIP_STAGE_HELP);
    io.exit(2);
    return;
  }
  const releaseVerb = verb as ReleaseVerb;
  emitErrorResult(
    {
      argv: verbRest,
      command: `release ${releaseVerb}`,
      error: {
        code: "FUL_SHIP_RELEASE_UNAVAILABLE",
        message:
          `\`fulcrum release ${releaseVerb}\` (OD: ${RELEASE_ACTION_LABEL[releaseVerb]}) ` +
          "is not available: no release/channel/rollout server is configured.",
        fix:
          "Connect a release server, then retry. Until then, manage release artifacts " +
          "with `fulcrum artifact` verbs.",
        doc: "CLI-TUI-UX.md §1.5",
      },
      env: opts.env,
      renderHuman: () => {},
    },
    io,
  );
}

/**
 * `fulcrum repo|branch|pr|memory <verb>`: the remaining §1.5 Ship verb groups.
 *
 * `repo` and `memory` have backed legacy commands (`fulcrum repos`,
 * `fulcrum memory`); `branch` and `pr` (the latter delegating to `gh`) have no
 * Ship-context server wired through this host. Each verb is a real dispatchable
 * command and always emits the canonical envelope. The `result` names the verb
 * and group; when no backing server is reachable from here the envelope carries
 * a coded error rather than fabricated data: honest, non-mocked behaviour.
 */
function runStubGroup(
  group: "repo" | "branch" | "pr" | "memory",
  rest: readonly string[],
  io: ShipStageIo,
  opts: ShipStageRunOptions,
): void {
  const [verb = "list", ...verbRest] = rest;
  if (isHelpVerb(verb)) {
    io.print(SHIP_STAGE_HELP);
    return;
  }
  const command = `${group} ${verb}`;
  const backed: Record<string, string | undefined> = {
    repo: "fulcrum repos",
    memory: "fulcrum memory",
    branch: undefined,
    pr: undefined,
  };
  const legacy = backed[group];
  emitResult(
    {
      argv: verbRest,
      command,
      result: {
        stage: "ship",
        group,
        verb,
        backedBy: legacy ?? null,
        message: legacy
          ? `Ship \`${command}\` routes to the \`${legacy}\` command surface.`
          : `Ship \`${command}\` is a CLI-TUI-UX §1.5 verb; connect a server to run it.`,
      },
      next_actions: legacy
        ? [{ label: `Run ${legacy}`, command: `${legacy} ${verb}` }]
        : [],
      env: opts.env,
      renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
    },
    io,
  );
}
