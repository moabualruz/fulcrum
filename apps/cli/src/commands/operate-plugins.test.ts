import { describe, expect, test } from "bun:test";

import { run, type ClaudePluginMarker } from "./operate-plugins.ts";

function fakeMarkers(): readonly ClaudePluginMarker[] {
  return [
    { id: "claude-code", name: "Claude Code", enabled: true, source: "claude", marker: "BEGIN-FULCRUM-RULES" },
    { id: "user-rules", name: "User Rules", enabled: false, source: "user", marker: "user.md" },
  ];
}

function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  let code = 0;
  return {
    print: (line: string) => out.push(line),
    printErr: (line: string) => err.push(line),
    exit: (next: number) => { code = next; },
    out,
    err,
    get code() { return code; },
  };
}

/** The twelve canonical `fulcrum.cli.v1` envelope keys (CLI-TUI-UX.md §3). */
const ENVELOPE_KEYS = [
  "schema",
  "trace_id",
  "span_id",
  "run_id",
  "project_id",
  "command",
  "args",
  "result",
  "errors",
  "next_actions",
  "duration_ms",
  "timestamp",
] as const;

function expectCanonicalEnvelope(line: string): Record<string, unknown> {
  const envelope = JSON.parse(line) as Record<string, unknown>;
  expect(envelope["schema"]).toBe("fulcrum.cli.v1");
  for (const key of ENVELOPE_KEYS) expect(envelope).toHaveProperty(key);
  expect(Array.isArray(envelope["errors"])).toBe(true);
  expect(Array.isArray(envelope["next_actions"])).toBe(true);
  return envelope;
}

describe("fulcrum operate plugins", () => {
  test("help path prints usage and exits successfully", async () => {
    const io = captureIO();
    await run(["help"], io);
    expect(io.out.join("\n")).toContain("fulcrum operate plugins");
    expect(io.code).toBe(0);
  });

  test("list human output formats each marker with enable icon and source", async () => {
    const io = captureIO();
    await run(["list"], { ...io, loadPlugins: async () => fakeMarkers() });
    expect(io.out.join("\n")).toContain("✓ claude-code");
    expect(io.out.join("\n")).toContain("○ user-rules");
  });

  test("show with unknown id returns an actionable error", async () => {
    const io = captureIO();
    await run(["show", "missing"], { ...io, loadPlugins: async () => fakeMarkers() });
    expect(io.err.join("\n")).toContain("unknown plugin id 'missing'");
    expect(io.code).toBe(1);
  });

  test("loader failure surfaces the message to stderr", async () => {
    const io = captureIO();
    await run(["list"], {
      ...io,
      loadPlugins: async () => { throw new Error("config corrupt"); },
    });
    expect(io.err.join("\n")).toContain("config corrupt");
    expect(io.code).toBe(1);
  });
});

describe("operate plugin list: canonical envelope, not a raw array", () => {
  test("`list --json` emits the fulcrum.cli.v1 envelope even with an injected loader", async () => {
    const io = captureIO();
    await run(["list", "--json"], { ...io, loadPlugins: async () => fakeMarkers() });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum operate plugin list");
    expect(envelope["result"]).toHaveLength(2);
    expect((envelope["result"] as ClaudePluginMarker[])[0]?.id).toBe("claude-code");
  });

  test("`list --json` is never a bare top-level array", async () => {
    const io = captureIO();
    await run(["list", "--json"], { ...io, loadPlugins: async () => fakeMarkers() });
    expect(Array.isArray(JSON.parse(io.out[0]!))).toBe(false);
  });

  test("`list --json --json-raw` opts back into the pre-envelope array payload", async () => {
    const io = captureIO();
    await run(["list", "--json", "--json-raw"], { ...io, loadPlugins: async () => fakeMarkers() });
    const parsed = JSON.parse(io.out[0]!) as ClaudePluginMarker[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  test("`list --json --agent codex` echoes the resolved §1.8 scope in args", async () => {
    const io = captureIO();
    await run(["list", "--json", "--agent", "codex"], { ...io, loadPlugins: async () => fakeMarkers() });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect((envelope["args"] as { agents: string[] }).agents).toEqual(["codex"]);
  });

  test("`show <id> --json` emits the canonical envelope with the marker under result", async () => {
    const io = captureIO();
    await run(["show", "claude-code", "--json"], { ...io, loadPlugins: async () => fakeMarkers() });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum operate plugin show");
    expect((envelope["result"] as ClaudePluginMarker).id).toBe("claude-code");
  });

  test("`show missing --json` emits a coded canonical error envelope", async () => {
    const io = captureIO();
    await run(["show", "missing", "--json"], { ...io, loadPlugins: async () => fakeMarkers() });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNKNOWN_ID");
  });
});

describe("fulcrum plugin: CLI-TUI-UX.md §1.6 root alias", () => {
  test("`plugin list --json` reports the root grammar in the envelope command", async () => {
    const io = captureIO();
    await run(["plugin", "list", "--json"], {
      ...io,
      invocationRoot: "plugin",
      loadPlugins: async () => fakeMarkers(),
    });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum plugin list");
    expect(envelope["result"]).toHaveLength(2);
  });

  test("`plugin show <id> --json` reports the root grammar in the envelope command", async () => {
    const io = captureIO();
    await run(["plugin", "show", "claude-code", "--json"], {
      ...io,
      invocationRoot: "plugin",
      loadPlugins: async () => fakeMarkers(),
    });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum plugin show");
  });

  test("`plugin help` prints the plugin usage block", async () => {
    const io = captureIO();
    await run(["plugin"], { ...io, invocationRoot: "plugin" });
    expect(io.out.join("\n")).toContain("fulcrum operate plugin");
    expect(io.code).toBe(0);
  });
});

describe("operate plugin mutations: coded error envelopes (no cross-agent server)", () => {
  test("`enable <name> --agent codex --json` emits FUL_OPERATE_PLUGIN_UNAVAILABLE", async () => {
    const io = captureIO();
    await run(["plugin", "enable", "caveman", "--agent", "codex", "--json"], io);
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum operate plugin enable");
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
    expect((envelope["args"] as { agents: string[] }).agents).toEqual(["codex"]);
  });

  test("root `plugin enable` reports the root grammar in the error envelope command", async () => {
    const io = captureIO();
    await run(["plugin", "enable", "caveman", "--agent", "codex", "--json"], {
      ...io,
      invocationRoot: "plugin",
    });
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    expect(envelope["command"]).toBe("fulcrum plugin enable");
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNAVAILABLE");
  });

  test("`enable --agent bogus --json` emits FUL_OPERATE_PLUGIN_UNKNOWN_AGENT", async () => {
    const io = captureIO();
    await run(["plugin", "enable", "caveman", "--agent", "bogus", "--json"], io);
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNKNOWN_AGENT");
  });

  test("`enable --json` with no name emits FUL_OPERATE_PLUGIN_MISSING_NAME", async () => {
    const io = captureIO();
    await run(["plugin", "enable", "--json"], io);
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_MISSING_NAME");
  });

  test("unknown plugin verb under `--json` emits FUL_OPERATE_PLUGIN_UNKNOWN_VERB", async () => {
    const io = captureIO();
    await run(["plugin", "frobnicate", "--json"], io);
    const envelope = expectCanonicalEnvelope(io.out[0]!);
    const errors = envelope["errors"] as Array<{ code: string }>;
    expect(errors[0]?.code).toBe("FUL_OPERATE_PLUGIN_UNKNOWN_VERB");
  });
});
