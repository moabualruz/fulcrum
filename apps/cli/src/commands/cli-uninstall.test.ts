import { describe, expect, test } from "bun:test";

import {
  planUninstall,
  run,
  type UninstallTarget,
} from "./cli-uninstall.ts";

const FIXTURES: readonly UninstallTarget[] = [
  { id: "hook-format", kind: "hook", path: "/Users/dev/.claude/hooks/format.sh", agent: "claude" },
  { id: "rules-claude", kind: "rule-block", path: "/Users/dev/.claude/CLAUDE.md", agent: "claude" },
  { id: "skill-cache", kind: "skill-cache", path: "/Users/dev/.fulcrum/skills" },
  { id: "policy", kind: "policy-file", path: "/Users/dev/.fulcrum/policy.toml" },
  { id: "caveman", kind: "caveman", path: "/Users/dev/.fulcrum/caveman", agent: "claude" },
  { id: "mcp", kind: "mcp", path: "/Users/dev/.claude/mcp/fulcrum.json", agent: "claude" },
  { id: "component-ledger", kind: "component-ledger", path: "/Users/dev/.fulcrum/ledger.db" },
];

describe("planUninstall", () => {
  test("default plan removes hooks, rules block, and MCPs only", () => {
    const plan = planUninstall(FIXTURES, {});
    const kinds = plan.targets.map((target) => target.kind);
    expect(kinds).toContain("hook");
    expect(kinds).toContain("rule-block");
    expect(kinds).toContain("mcp");
    expect(kinds).not.toContain("skill-cache");
    expect(kinds).not.toContain("caveman");
  });

  test("--purge adds skill-cache, policy-file, and component-ledger", () => {
    const plan = planUninstall(FIXTURES, { purge: true });
    const kinds = plan.targets.map((target) => target.kind);
    expect(kinds).toContain("skill-cache");
    expect(kinds).toContain("policy-file");
    expect(kinds).toContain("component-ledger");
  });

  test("--include-caveman adds caveman targets", () => {
    const plan = planUninstall(FIXTURES, { includeCaveman: true });
    const kinds = plan.targets.map((target) => target.kind);
    expect(kinds).toContain("caveman");
  });
});

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

describe("fulcrum uninstall", () => {
  test("help path prints usage", async () => {
    const io = captureIO();
    await run(["help"], io);
    expect(io.out.join("\n")).toContain("fulcrum uninstall");
  });

  test("--dry-run lists targets and preserves the skipped set", async () => {
    const io = captureIO();
    await run(["--dry-run"], { ...io, resolveTargets: async () => FIXTURES });
    expect(io.out.join("\n")).toContain("Would remove");
    expect(io.out.join("\n")).toContain("kept:");
    expect(io.code).toBe(0);
  });

  test("missing resolver returns an actionable error", async () => {
    const io = captureIO();
    await run([], io);
    expect(io.err.join("\n")).toContain("target resolver is not configured");
    expect(io.code).toBe(1);
  });

  test("apply path invokes removeTarget per included entry", async () => {
    const io = captureIO();
    const removed: string[] = [];
    await run([], {
      ...io,
      resolveTargets: async () => FIXTURES,
      removeTarget: async (target) => { removed.push(target.id); },
    });
    expect(removed).toContain("hook-format");
    expect(removed).toContain("rules-claude");
    expect(removed).not.toContain("caveman");
    expect(io.out.join("\n")).toContain("Removed");
  });
});
