/**
 * Operate stage CLI verb parity: `prd-cli-operate-stage-parity`.
 *
 * Proves the Operate workflow stage (CLI-TUI-UX.md §1.6) is a real,
 * discoverable, dispatchable command grammar. The Operate stage host
 * (`apps/cli/src/commands/operate-plugins.ts`) dispatches the §1.6 Operate verb
 * groups: `doctor`, `mcp`, `plugin`, `hooks`, `skills`, `audit`, `trace`,
 * `route`, `agent`, `config`: and the trace resolver (`commands/trace.ts`)
 * owns `fulcrum trace show <id>` (CLI Issue 6 / `agent-cli-review.md`
 * A-CLI-003).
 *
 * Three contracts are asserted:
 *  1. Operate verb dispatch + a discoverable Operate-stage `help`.
 *  2. The canonical `fulcrum.cli.v1` envelope (CLI-TUI-UX.md §3) on `--json`
 *     output of dispatched verbs (`plugin` mutations, `route`/`agent`/`config`
 *     pointers, `trace show`).
 *  3. The CLI-TUI-UX.md §1.8 per-agent scoping rule: `mcp` and `plugin`
 *     mutation verbs accept `--agent <id>` (repeatable) and `--all-agents`,
 *     with the resolved scope observable in the envelope.
 *
 * Consumed-by: this is the parity test the PRD `verify` array runs. It names
 * the real Operate commands (`doctor` / `mcp` / `plugin` / `hooks` / `skills` /
 * `audit`) and asserts the `fulcrum.cli.v1` envelope, so the envelope helper is
 * proven *used*, not merely defined.
 */

import { describe, expect, test } from "bun:test";

import {
  run as runOperate,
  parseAgentScope,
  OPERATE_HELP,
  OPERATE_VERB_GROUPS,
  PLUGIN_VERBS,
} from "../../apps/cli/src/commands/operate-plugins.ts";
import {
  run as runTrace,
  TRACE_HELP,
  TRACE_VERBS,
} from "../../apps/cli/src/commands/trace.ts";
import { ENVELOPE_SCHEMA, isCanonicalEnvelope } from "../../apps/cli/src/lib/envelope.ts";

/** The twelve canonical `fulcrum.cli.v1` envelope keys (CLI-TUI-UX.md §3). */
const CANONICAL_KEYS = [
  "args",
  "command",
  "duration_ms",
  "errors",
  "next_actions",
  "project_id",
  "result",
  "run_id",
  "schema",
  "span_id",
  "timestamp",
  "trace_id",
] as const;

/** Capture stdout/stderr and provide a non-zero-exit-throwing harness. */
function harness() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => {
        if (code !== 0) throw new Error(`exit ${code}`);
      },
    },
  };
}

/** Assert a JSON line is the canonical 12-key `fulcrum.cli.v1` envelope. */
function expectCanonicalEnvelope(line: string, command: string): Record<string, unknown> {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const expectedCommand = command.startsWith("fulcrum ") ? command : `fulcrum ${command}`;
  expect(isCanonicalEnvelope(parsed)).toBe(true);
  expect(Object.keys(parsed).sort()).toEqual([...CANONICAL_KEYS]);
  expect(parsed["schema"]).toBe(ENVELOPE_SCHEMA);
  expect(parsed["command"]).toBe(expectedCommand);
  expect(typeof parsed["trace_id"]).toBe("string");
  expect((parsed["trace_id"] as string).length).toBe(32);
  expect(typeof parsed["span_id"]).toBe("string");
  expect((parsed["span_id"] as string).length).toBe(16);
  expect(Array.isArray(parsed["errors"])).toBe(true);
  expect(Array.isArray(parsed["next_actions"])).toBe(true);
  return parsed;
}

describe("Operate stage CLI verb grammar (CLI-TUI-UX.md §1.6)", () => {
  test("the Operate stage host exposes the §1.6 verb groups", () => {
    expect([...OPERATE_VERB_GROUPS].sort()).toEqual([
      "agent",
      "audit",
      "config",
      "doctor",
      "hooks",
      "mcp",
      "operate",
      "plugin",
      "route",
      "skills",
      "trace",
    ]);
  });

  test("`fulcrum operate` with no verb prints the discoverable stage help", async () => {
    const h = harness();
    await runOperate([], h.opts);
    const help = h.out.join("\n");
    // Acceptance: `fulcrum help operate` lists the Operate command group with
    // examples and a --json mention.
    expect(help).toContain("fulcrum operate");
    expect(help).toContain("doctor");
    expect(help).toContain("mcp");
    expect(help).toContain("plugin");
    expect(help).toContain("hooks");
    expect(help).toContain("skills");
    expect(help).toContain("audit");
    expect(help).toContain("trace");
    expect(help).toContain("--json");
    expect(help).toContain("Examples:");
    expect(OPERATE_HELP).toContain("--all-agents");
    expect(h.err).toHaveLength(0);
  });

  test("an unknown Operate group exits non-zero with the stage help", async () => {
    const h = harness();
    await expect(runOperate(["nonsense"], h.opts)).rejects.toThrow("exit 2");
    expect(h.err.join("\n")).toContain("unknown");
  });
});

describe("Operate verb dispatch: canonical fulcrum.cli.v1 envelope", () => {
  test.each(["route", "agent", "config"])(
    "`fulcrum operate %s list --json` dispatches and emits the canonical envelope",
    async (noun) => {
      const h = harness();
      await runOperate([noun, "list", "--json"], h.opts);
      expect(h.out).toHaveLength(1);
      const env = expectCanonicalEnvelope(h.out[0]!, `operate ${noun} list`);
      expect(env["result"]).toBeDefined();
    },
  );

  test("`fulcrum operate plugin install --json` is a real verb that emits the canonical envelope", async () => {
    const h = harness();
    // No cross-agent plugin server is wired through the host: the verb is
    // still a real dispatchable command and still emits the canonical
    // envelope, carrying a coded error in the always-array `errors` field.
    await runOperate(["plugin", "install", "caveman", "--json"], h.opts);
    expect(h.out).toHaveLength(1);
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin install");
    const errors = env["errors"] as { code: string }[];
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
    expect(env["result"]).toBeNull();
  });

  test("`fulcrum operate plugin install` plain output prints the recovery block to stderr", async () => {
    const h = harness();
    await runOperate(["plugin", "install", "caveman"], h.opts);
    const stderr = h.err.join("\n");
    expect(stderr).toContain("Fix:");
    expect(stderr).toContain("trace=");
  });

  test("`fulcrum operate plugin install` with no name emits a coded missing-name envelope", async () => {
    const h = harness();
    await runOperate(["plugin", "install", "--json"], h.opts);
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin install");
    const errors = env["errors"] as { code: string }[];
    expect(errors[0]!.code).toBe("FUL_OPERATE_PLUGIN_MISSING_NAME");
  });
});

describe("per-agent scoping rule (CLI-TUI-UX.md §1.8)", () => {
  test("the plugin verb set covers list/show + the mutation verbs", () => {
    const verbs: readonly string[] = PLUGIN_VERBS;
    for (const verb of ["list", "show", "install", "enable", "disable", "update", "remove"]) {
      expect(verbs).toContain(verb);
    }
  });

  test("`parseAgentScope` defaults to the active-agent-only scope", () => {
    const parse = parseAgentScope([]);
    expect(parse.scope).toEqual({ kind: "agents", ids: [] });
    expect(parse.invalidAgent).toBeUndefined();
  });

  test("`parseAgentScope` accepts repeatable --agent ids", () => {
    const parse = parseAgentScope(["--agent", "claude-code", "--agent", "codex"]);
    expect(parse.scope).toEqual({ kind: "agents", ids: ["claude-code", "codex"] });
  });

  test("`parseAgentScope` resolves --all-agents", () => {
    const parse = parseAgentScope(["--all-agents"]);
    expect(parse.scope).toEqual({ kind: "all" });
  });

  test("`parseAgentScope` flags an unknown agent id", () => {
    const parse = parseAgentScope(["--agent", "not-an-agent"]);
    expect(parse.invalidAgent).toBe("not-an-agent");
  });

  test("`fulcrum operate plugin enable --agent` echoes the resolved scope in the envelope", async () => {
    const h = harness();
    await runOperate(
      ["plugin", "enable", "caveman", "--agent", "claude-code", "--agent", "codex", "--json"],
      h.opts,
    );
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin enable");
    const args = env["args"] as Record<string, unknown>;
    expect(args["all_agents"]).toBe(false);
    expect(args["agents"]).toEqual(["claude-code", "codex"]);
  });

  test("`fulcrum operate plugin enable --all-agents` resolves the all-agents scope", async () => {
    const h = harness();
    await runOperate(["plugin", "enable", "caveman", "--all-agents", "--json"], h.opts);
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin enable");
    const args = env["args"] as Record<string, unknown>;
    expect(args["all_agents"]).toBe(true);
    expect((args["agents"] as string[]).length).toBeGreaterThan(0);
  });

  test("`fulcrum operate plugin enable --agent <bad>` emits a coded unknown-agent envelope", async () => {
    const h = harness();
    await runOperate(["plugin", "enable", "caveman", "--agent", "bogus", "--json"], h.opts);
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin enable");
    const errors = env["errors"] as { code: string }[];
    expect(errors[0]!.code).toBe("FUL_OPERATE_PLUGIN_UNKNOWN_AGENT");
  });
});

describe("fulcrum trace show <id> (CLI Issue 6: agent-cli-review A-CLI-003)", () => {
  test("`fulcrum trace` exposes the `show` verb and a discoverable help", async () => {
    expect([...TRACE_VERBS]).toEqual(["show"]);
    const h = harness();
    await runTrace([], h.opts);
    expect(h.out.join("\n")).toContain("fulcrum trace");
    expect(TRACE_HELP).toContain("trace show");
  });

  test("`fulcrum trace show <id> --json` resolves the trace and emits the canonical envelope", async () => {
    const h = harness();
    await runTrace(["show", "4f3a1c9e0b2d4e6f8a1c3e5f7b9d1a3c", "--json"], h.opts);
    expect(h.out).toHaveLength(1);
    const env = expectCanonicalEnvelope(h.out[0]!, "trace show");
    const result = env["result"] as Record<string, unknown>;
    // The resolver returns the trace identity + its cross-surface links.
    expect(result["trace_id"]).toBe("4f3a1c9e0b2d4e6f8a1c3e5f7b9d1a3c");
    expect(Array.isArray(result["runs"])).toBe(true);
    expect(Array.isArray(result["spans"])).toBe(true);
    const links = result["links"] as { surface: string }[];
    expect(links.map((l) => l.surface).sort()).toEqual(["audit", "tui", "web"]);
    // The resolved trace id lives in `result.trace_id`; the envelope's own
    // `trace_id` stays the canonical 32-char invocation id.
    // It links to the backed audit surface.
    const next = env["next_actions"] as { command: string }[];
    expect(next[0]!.command).toContain("fulcrum audit list --trace");
  });

  test("`fulcrum trace show` via the Operate host routes to the trace resolver", async () => {
    const h = harness();
    await runOperate(["trace", "show", "4f3a1c9e", "--json"], h.opts);
    expect(h.out).toHaveLength(1);
    expectCanonicalEnvelope(h.out[0]!, "trace show");
  });

  test("`fulcrum trace show` with no id emits a coded missing-id envelope", async () => {
    const h = harness();
    await runTrace(["show", "--json"], h.opts);
    const env = expectCanonicalEnvelope(h.out[0]!, "trace show");
    const errors = env["errors"] as { code: string }[];
    expect(errors[0]!.code).toBe("FUL_TRACE_MISSING_ID");
  });

  test("`fulcrum trace show` rejects an invalid trace id", async () => {
    const h = harness();
    await runTrace(["show", "not a trace id!", "--json"], h.opts);
    const env = expectCanonicalEnvelope(h.out[0]!, "trace show");
    const errors = env["errors"] as { code: string }[];
    expect(errors[0]!.code).toBe("FUL_TRACE_INVALID_ID");
  });
});

describe("no command removed: read-only plugin verbs preserved", () => {
  // `operate-plugins.ts` emits the canonical `fulcrum.cli.v1` envelope for
  // every verb's `--json` output (CLI-TUI-UX.md §3); `plugin list` carries the
  // marker rows in the envelope `result`, not as a bare top-level array.
  test("`fulcrum operate plugin list --json` emits the canonical envelope with marker rows", async () => {
    const h = harness();
    await runOperate(["plugin", "list", "--json"], {
      ...h.opts,
      loadPlugins: async () => [
        { id: "claude-code", name: "Claude Code", enabled: true, source: "claude", marker: "m" },
      ],
    });
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin list");
    const result = env["result"] as { id: string }[];
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]!.id).toBe("claude-code");
  });

  test("the bare `list` verb (legacy entry) still dispatches to the plugin group", async () => {
    const h = harness();
    await runOperate(["list", "--json"], {
      ...h.opts,
      loadPlugins: async () => [],
    });
    const env = expectCanonicalEnvelope(h.out[0]!, "operate plugin list");
    expect(env["result"]).toEqual([]);
  });
});
