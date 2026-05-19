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

describe("fulcrum operate plugins", () => {
  test("help path prints usage and exits successfully", async () => {
    const io = captureIO();
    await run(["help"], io);
    expect(io.out.join("\n")).toContain("fulcrum operate plugins");
    expect(io.code).toBe(0);
  });

  test("list emits a parseable JSON array under --json", async () => {
    const io = captureIO();
    await run(["list", "--json"], { ...io, loadPlugins: async () => fakeMarkers() });
    const parsed = JSON.parse(io.out[0]!) as ClaudePluginMarker[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.id).toBe("claude-code");
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

  test("missing loader yields configuration error", async () => {
    const io = captureIO();
    await run(["list"], io);
    expect(io.err.join("\n")).toContain("loader is not configured");
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
