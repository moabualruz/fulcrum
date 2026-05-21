/**
 * CLI flag conventions tests — proves `CLI-TUI-UX.md` §2 is codified in the
 * shared `apps/cli/src/lib/flag-conventions.ts` module and enforced.
 *
 * PRD `prd-cli-flag-conventions`. Acceptance:
 *   1. Every command accepts the documented global flags where applicable:
 *      --help, --json, --no-color, --profile, --agent, --all-agents.
 *   2. Flag precedence is command flag > env > config > default, and is tested.
 *   3. Secret/config mutating commands respect agent scoping and do not leak
 *      secrets in errors or JSON.
 *   4. Help works even after other flags and the JSON envelope stays canonical.
 *
 * `done_mode: json-envelope` — the final test asserts the canonical
 * `fulcrum.cli.v1` envelope is unaffected by global-flag splitting.
 */

import { describe, expect, it } from "bun:test";

import { run as runAuth } from "../../apps/cli/src/commands/auth.ts";
import { isCanonicalEnvelope } from "../../apps/cli/src/lib/envelope.ts";
import {
  CTRL_C_FIRST_INTERRUPT_MESSAGE,
  FORBIDDEN_SECRET_FLAGS,
  GLOBAL_BOOLEAN_FLAGS,
  GLOBAL_FLAGS,
  PRECEDENCE_ORDER,
  SecretInArgvError,
  assertNoSecretInArgv,
  createInterruptHandler,
  findGlobalFlag,
  isColorDisabled,
  isColorEnabled,
  isGlobalFlag,
  isSecretFlag,
  redactArgvForJson,
  renderGlobalFlagsHelp,
  resolveWithPrecedence,
  splitGlobalFlags,
  wantsHelp,
  wantsVersion,
} from "../../apps/cli/src/lib/flag-conventions.ts";
import { emitResult } from "../../apps/cli/src/lib/cli-output.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 1 — documented global flags exist with one grammar
// ─────────────────────────────────────────────────────────────────────────────

describe("acceptance 1 — documented global flags", () => {
  it("registers every CLI-TUI-UX.md §2 global flag the PRD names", () => {
    for (const flag of ["--help", "--json", "--no-color", "--profile", "--agent", "--all-agents"]) {
      expect(isGlobalFlag(flag)).toBe(true);
    }
  });

  it("recognises the short alias of a flag that defines one", () => {
    expect(isGlobalFlag("-h")).toBe(true);
    expect(findGlobalFlag("-h")?.long).toBe("--help");
    expect(findGlobalFlag("-V")?.long).toBe("--version");
    expect(findGlobalFlag("-o")?.long).toBe("--output");
  });

  it("rejects an unknown token as a global flag", () => {
    expect(isGlobalFlag("--not-a-flag")).toBe(false);
    expect(findGlobalFlag("--not-a-flag")).toBeUndefined();
  });

  it("marks value-taking flags distinct from boolean flags", () => {
    expect(findGlobalFlag("--profile")?.takesValue).toBe(true);
    expect(findGlobalFlag("--json")?.takesValue).toBe(false);
    expect(GLOBAL_BOOLEAN_FLAGS.has("--json")).toBe(true);
    expect(GLOBAL_BOOLEAN_FLAGS.has("--profile")).toBe(false);
  });

  it("splitGlobalFlags partitions a command's argv from §2 global flags", () => {
    const split = splitGlobalFlags(["whoami", "--json", "--profile", "ci", "--no-color", "POS"]);
    expect(split.global).toEqual(["--json", "--profile", "ci", "--no-color"]);
    expect(split.rest).toEqual(["whoami", "POS"]);
  });

  it("splitGlobalFlags honours `--` as the end of global-flag parsing", () => {
    const split = splitGlobalFlags(["--json", "--", "--profile", "literal"]);
    expect(split.global).toEqual(["--json"]);
    expect(split.rest).toEqual(["--", "--profile", "literal"]);
  });

  it("splitGlobalFlags accepts `--flag=value` form for value-taking flags", () => {
    const split = splitGlobalFlags(["--profile=ci", "rest"]);
    expect(split.global).toEqual(["--profile=ci"]);
    expect(split.rest).toEqual(["rest"]);
  });

  it("renders one consistent global-flags help block for every command", () => {
    const help = renderGlobalFlagsHelp();
    expect(help).toContain("Global flags (CLI-TUI-UX.md §2)");
    for (const flag of GLOBAL_FLAGS) {
      expect(help).toContain(flag.long);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 2 — flag > env > config > default precedence
// ─────────────────────────────────────────────────────────────────────────────

describe("acceptance 2 — config precedence (CLI-TUI-UX.md §2.2)", () => {
  it("orders layers flag > env > project > user > system > default", () => {
    expect(PRECEDENCE_ORDER).toEqual([
      "flag",
      "env",
      "projectConfig",
      "userConfig",
      "systemConfig",
      "default",
    ]);
  });

  it("a command flag beats env, config, and default", () => {
    const resolved = resolveWithPrecedence({
      flag: "from-flag",
      env: "from-env",
      projectConfig: "from-project",
      default: "from-default",
    });
    expect(resolved.value).toBe("from-flag");
    expect(resolved.source).toBe("flag");
  });

  it("env beats config and default when no flag is given", () => {
    const resolved = resolveWithPrecedence({
      env: "from-env",
      userConfig: "from-user",
      default: "from-default",
    });
    expect(resolved.value).toBe("from-env");
    expect(resolved.source).toBe("env");
  });

  it("project config beats user and system config", () => {
    const resolved = resolveWithPrecedence({
      projectConfig: "from-project",
      userConfig: "from-user",
      systemConfig: "from-system",
    });
    expect(resolved.source).toBe("projectConfig");
  });

  it("falls through to the built-in default when nothing else is set", () => {
    const resolved = resolveWithPrecedence({ default: "fallback" });
    expect(resolved.value).toBe("fallback");
    expect(resolved.source).toBe("default");
  });

  it("returns undefined provenance when no layer supplies a value", () => {
    const resolved = resolveWithPrecedence<string>({});
    expect(resolved.value).toBeUndefined();
    expect(resolved.source).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 3 — secrets never leak; agent scoping respected
// ─────────────────────────────────────────────────────────────────────────────

describe("acceptance 3 — secrets handling (CLI-TUI-UX.md §2.1)", () => {
  it("classifies every forbidden secret flag", () => {
    for (const flag of FORBIDDEN_SECRET_FLAGS) {
      expect(isSecretFlag(flag)).toBe(true);
    }
    expect(isSecretFlag("--token=abc")).toBe(true);
    expect(isSecretFlag("--json")).toBe(false);
  });

  it("assertNoSecretInArgv throws a coded error when a secret is on argv", () => {
    expect(() => assertNoSecretInArgv(["login", "--token", "s3cr3t"])).toThrow(SecretInArgvError);
    try {
      assertNoSecretInArgv(["login", "--token", "s3cr3t"]);
    } catch (err) {
      expect(err).toBeInstanceOf(SecretInArgvError);
      expect((err as SecretInArgvError).code).toBe("FUL_CLI_SECRET_IN_ARGV");
      // The secret VALUE must never appear in the error message.
      expect((err as SecretInArgvError).message).not.toContain("s3cr3t");
      expect((err as SecretInArgvError).message).toContain("--token");
    }
  });

  it("assertNoSecretInArgv passes when no secret flag is present", () => {
    expect(() => assertNoSecretInArgv(["login", "--non-interactive"])).not.toThrow();
  });

  it("redactArgvForJson replaces secret values before they reach the envelope", () => {
    const redacted = redactArgvForJson({ "--token": "s3cr3t", "--json": true, "--agent": "codex" });
    expect(redacted["--token"]).toBe("<REDACTED>");
    expect(redacted["--token"]).not.toBe("s3cr3t");
    expect(redacted["--json"]).toBe(true);
    expect(redacted["--agent"]).toBe("codex");
  });

  it("fulcrum auth login refuses a secret on argv and never echoes the value", async () => {
    const out: string[] = [];
    const err: string[] = [];
    let code: number | undefined;
    await runAuth(["login", "--token", "leak-me-please"], {
      print: (l) => out.push(l),
      printErr: (l) => err.push(l),
      exit: (c) => {
        code = c;
      },
    });
    const errText = err.join("\n");
    expect(code).toBe(2);
    expect(errText).toContain("--token");
    expect(errText).not.toContain("leak-me-please");
  });

  it("respects --agent scoping as a documented global flag", () => {
    // Agent scoping is part of the §1.8/§2 global grammar — a command can read
    // it uniformly via splitGlobalFlags.
    const split = splitGlobalFlags(["set", "key", "value", "--agent", "codex"]);
    expect(split.global).toEqual(["--agent", "codex"]);
    expect(isGlobalFlag("--all-agents")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance 4 — help works after other flags; envelope stays canonical
// ─────────────────────────────────────────────────────────────────────────────

describe("acceptance 4 — help after flags + canonical envelope", () => {
  it("wantsHelp detects --help anywhere in argv, even last", () => {
    expect(wantsHelp(["whoami", "--json", "--help"])).toBe(true);
    expect(wantsHelp(["-h"])).toBe(true);
    expect(wantsHelp(["whoami", "--json"])).toBe(false);
  });

  it("wantsVersion detects -V / --version anywhere in argv", () => {
    expect(wantsVersion(["doctor", "--version"])).toBe(true);
    expect(wantsVersion(["doctor", "-V"])).toBe(true);
    expect(wantsVersion(["doctor"])).toBe(false);
  });

  it("fulcrum auth shows help even when --help follows a subcommand", async () => {
    const out: string[] = [];
    await runAuth(["whoami", "--help"], {
      print: (l) => out.push(l),
      printErr: () => {},
      exit: () => {},
    });
    expect(out.join("\n")).toContain("Authentication commands");
  });

  it("the fulcrum.cli.v1 envelope stays canonical alongside global flags", () => {
    const out: string[] = [];
    emitResult(
      {
        argv: ["--json", "--no-color", "--profile", "ci"],
        command: "fulcrum demo",
        result: { ok: true },
        renderHuman: () => {},
        now: () => 1_700_000_000_000,
      },
      { print: (l) => out.push(l), printErr: () => {} },
    );
    const parsed = JSON.parse(out[0] as string);
    expect(isCanonicalEnvelope(parsed)).toBe(true);
    expect(parsed.schema).toBe("fulcrum.cli.v1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2.3 colour disable / §2.4 Ctrl-C
// ─────────────────────────────────────────────────────────────────────────────

describe("§2.3 colour disable", () => {
  it("disables colour for any §2.3 condition", () => {
    expect(isColorDisabled({ isTty: false })).toBe(true);
    expect(isColorDisabled({ isTty: true, argv: ["--no-color"] })).toBe(true);
    expect(isColorDisabled({ isTty: true, env: { NO_COLOR: "" } })).toBe(true);
    expect(isColorDisabled({ isTty: true, env: { FULCRUM_NO_COLOR: "1" } })).toBe(true);
    expect(isColorDisabled({ isTty: true, env: { TERM: "dumb" } })).toBe(true);
  });

  it("enables colour only on a clean TTY with no opt-out", () => {
    expect(isColorEnabled({ isTty: true, env: {}, argv: [] })).toBe(true);
    expect(isColorDisabled({ isTty: true, env: {}, argv: [] })).toBe(false);
  });
});

describe("§2.4 Ctrl-C", () => {
  it("first SIGINT prints the graceful-stop copy and does not force-exit", () => {
    const handler = createInterruptHandler();
    const first = handler.onInterrupt();
    expect(first.message).toBe(CTRL_C_FIRST_INTERRUPT_MESSAGE);
    expect(first.force).toBe(false);
  });

  it("second SIGINT forces exit and skips cleanup", () => {
    const handler = createInterruptHandler();
    handler.onInterrupt();
    const second = handler.onInterrupt();
    expect(second.force).toBe(true);
    expect(second.message).toBeUndefined();
  });
});
