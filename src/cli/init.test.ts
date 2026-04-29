// Tests for fulcrum init — bootstrap + vendor integration commands.
//
// All tests use scratch HOME dirs via mkdtemp. No real graphify/repomix/npx
// commands are spawned — proc.run is mocked.

import { describe, expect, test, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function freshDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "fulcrum-init-"));
}

// ---------------------------------------------------------------------------
// 1. AGENTS.md idempotency
// ---------------------------------------------------------------------------

describe("AGENTS.md idempotent", () => {
  let dir: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = dir;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
  });

  test("creates AGENTS.md on first run", async () => {
    const { run, setDryRun } = await import("./init.ts");
    setDryRun(false);
    const mod = await import("./vendor-installs.ts");
    const spy = spyOn(mod, "runVendorIntegrations").mockResolvedValue(undefined);
    try {
      await run([dir]);
      const agentsPath = join(dir, "AGENTS.md");
      expect(await Bun.file(agentsPath).exists()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("creates AGENTS.md for real (non-dry-run)", async () => {
    const { run, setDryRun } = await import("./init.ts");
    setDryRun(false);
    // Mock vendor integrations to prevent real subprocess spawns.
    const mod = await import("./vendor-installs.ts");
    const spy = spyOn(mod, "runVendorIntegrations").mockResolvedValue(undefined);
    try {
      await run([dir]);
      const agentsPath = join(dir, "AGENTS.md");
      expect(await Bun.file(agentsPath).exists()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test("does not overwrite existing AGENTS.md (idempotent)", async () => {
    const agentsPath = join(dir, "AGENTS.md");
    const originalContent = "# My existing AGENTS.md\n";
    await writeFile(agentsPath, originalContent);

    const { run, setDryRun } = await import("./init.ts");
    setDryRun(false);
    const mod = await import("./vendor-installs.ts");
    const spy = spyOn(mod, "runVendorIntegrations").mockResolvedValue(undefined);
    try {
      await run([dir]);
      const after = await readFile(agentsPath, "utf8");
      expect(after).toBe(originalContent);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. .claude/CLAUDE.md @import written once
// ---------------------------------------------------------------------------

describe(".claude/CLAUDE.md @import written once", () => {
  let dir: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = dir;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
  });

  test("creates .claude/CLAUDE.md with @AGENTS.md import", async () => {
    const { run, setDryRun } = await import("./init.ts");
    setDryRun(false);
    const mod = await import("./vendor-installs.ts");
    const spy = spyOn(mod, "runVendorIntegrations").mockResolvedValue(undefined);
    try {
      await run([dir]);
      const claudePath = join(dir, ".claude", "CLAUDE.md");
      const content = await readFile(claudePath, "utf8");
      expect(content).toContain("@AGENTS.md");
      // Run again — must not duplicate.
      await run([dir]);
      const after = await readFile(claudePath, "utf8");
      expect(after).toBe(content);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. .gitignore appended once
// ---------------------------------------------------------------------------

describe(".gitignore appended once (idempotent)", () => {
  let dir: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = dir;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
  });

  test("appends gitignore lines on first run, skips on second run", async () => {
    const { run, setDryRun } = await import("./init.ts");
    setDryRun(false);
    const mod = await import("./vendor-installs.ts");
    const spy = spyOn(mod, "runVendorIntegrations").mockResolvedValue(undefined);
    try {
      await run([dir]);
      const gi1 = await readFile(join(dir, ".gitignore"), "utf8");
      expect(gi1).toContain(".claude/settings.local.json");

      await run([dir]);
      const gi2 = await readFile(join(dir, ".gitignore"), "utf8");
      // Must not duplicate lines.
      const count = gi2.split(".claude/settings.local.json").length - 1;
      expect(count).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 4–5. Vendor integrations — graphify
// ---------------------------------------------------------------------------

describe("runVendorIntegrations — graphify", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("graphify claude install spawned when graphify + Claude Code present", async () => {
    // Simulate Claude Code detected.
    await mkdir(join(home, ".claude"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "graphify") return "/usr/local/bin/graphify";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });

      const calls = runSpy.mock.calls;
      const graphifyClaudeCalls = calls.filter(
        (c) => Array.isArray(c[0]) && c[0].join(" ") === "graphify claude install"
      );
      expect(graphifyClaudeCalls.length).toBeGreaterThanOrEqual(1);

      // Verify NO --output flag in any graphify call.
      for (const call of calls) {
        const cmd = Array.isArray(call[0]) ? call[0].join(" ") : String(call[0]);
        if (cmd.startsWith("graphify")) {
          expect(cmd).not.toContain("--output");
        }
      }
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("graphify install --platform codex spawned when Codex present", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "graphify") return "/usr/local/bin/graphify";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });

      const calls = runSpy.mock.calls;
      const codexCall = calls.find(
        (c) => Array.isArray(c[0]) && c[0].join(" ") === "graphify install --platform codex"
      );
      expect(codexCall).toBeDefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 6–8. Vendor integrations — ast-grep / tavily (npx skills add)
// ---------------------------------------------------------------------------

describe("runVendorIntegrations — npx skills add commands", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  async function runWithNpxMocked(): Promise<Parameters<typeof import("../utils/proc.ts")["run"]>[0][]> {
    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "npx") return "/usr/local/bin/npx";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });
      return runSpy.mock.calls.map((c) => c[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  }

  test("caveman is not installed through generic npx skills add during init", async () => {
    const calls = await runWithNpxMocked();
    const cavemanCall = calls.find(
      (c) => Array.isArray(c) && c.join(" ") === "npx skills add JuliusBrussee/caveman"
    );
    expect(cavemanCall).toBeUndefined();
  });

  test("npx skills add ast-grep/agent-skill spawned", async () => {
    const calls = await runWithNpxMocked();
    const astGrepCall = calls.find(
      (c) => Array.isArray(c) && c.join(" ") === "npx skills add ast-grep/agent-skill"
    );
    expect(astGrepCall).toBeDefined();
  });

  test("npx skills add https://github.com/tavily-ai/skills spawned", async () => {
    const calls = await runWithNpxMocked();
    const tavilyCall = calls.find(
      (c) => Array.isArray(c) && c.join(" ") === "npx skills add https://github.com/tavily-ai/skills"
    );
    expect(tavilyCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 9. context7 deferred note — no spawn
// ---------------------------------------------------------------------------

describe("runVendorIntegrations — context7 deferred (no spawn)", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("context7 deferred note printed; no ctx7 spawn", async () => {
    const proc = await import("../utils/proc.ts");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });

      // Must print deferred note.
      const ctx7Note = logs.find((l) => l.includes("context7") && l.includes("interactive"));
      expect(ctx7Note).toBeDefined();

      // Must not spawn ctx7 or npx ctx7.
      const ctx7Spawn = runSpy.mock.calls.find(
        (c) => Array.isArray(c[0]) && c[0].some((a: string) => a.includes("ctx7"))
      );
      expect(ctx7Spawn).toBeUndefined();
    } finally {
      runSpy.mockRestore();
      whichSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. pi-mcp-adapter init spawned when Pi present
// ---------------------------------------------------------------------------

describe("runVendorIntegrations — pi-mcp-adapter", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("pi-mcp-adapter init spawned when Pi detected and pi on PATH", async () => {
    // Simulate Pi detected.
    await mkdir(join(home, ".pi", "agent"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "pi") return "/usr/local/bin/pi";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });

      const calls = runSpy.mock.calls.map((c) => Array.isArray(c[0]) ? c[0].join(" ") : "");
      expect(calls.some((c) => c === "pi install npm:pi-mcp-adapter")).toBe(true);
      expect(calls.some((c) => c === "pi-mcp-adapter init")).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 11. --dry-run: prints preview, no spawns
// ---------------------------------------------------------------------------

describe("--dry-run: preview only, no spawns", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("dry-run prints [dry-run] lines, does not spawn processes", async () => {
    // Simulate Claude Code + npx detected.
    await mkdir(join(home, ".claude"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "graphify") return "/usr/local/bin/graphify";
      if (cmd === "npx") return "/usr/local/bin/npx";
      return null;
    });

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: true });

      // Should have dry-run preview lines.
      expect(logs.some((l) => l.includes("[dry-run]"))).toBe(true);
      // run() must NOT have been called.
      expect(runSpy.mock.calls.length).toBe(0);
    } finally {
      runSpy.mockRestore();
      whichSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 12. reindex subcommand: spawns `repomix --compress` with NO --output
// ---------------------------------------------------------------------------

describe("fulcrum init reindex", () => {
  let dir: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = dir;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
  });

  test("reindex spawns repomix --compress with NO --output flag", async () => {
    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "repomix") return "/usr/local/bin/repomix";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { run, setDryRun } = await import("./init.ts");
      setDryRun(false);
      await run(["reindex", dir]);

      const repomixCalls = runSpy.mock.calls.filter(
        (c) => Array.isArray(c[0]) && c[0][0] === "repomix"
      );
      expect(repomixCalls.length).toBeGreaterThanOrEqual(1);

      // Verify --compress is present and --output is absent.
      for (const call of repomixCalls) {
        const cmd = Array.isArray(call[0]) ? call[0] : [];
        expect(cmd).toContain("--compress");
        expect(cmd).not.toContain("--output");
      }
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("reindex skips gracefully when repomix not on PATH", async () => {
    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      const { run, setDryRun } = await import("./init.ts");
      setDryRun(false);
      await run(["reindex", dir]);

      expect(logs.some((l) => l.includes("repomix not on PATH"))).toBe(true);
      const repomixCalls = runSpy.mock.calls.filter(
        (c) => Array.isArray(c[0]) && c[0][0] === "repomix"
      );
      expect(repomixCalls.length).toBe(0);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 13. Vendor command failure: logs warning, does not throw
// ---------------------------------------------------------------------------

describe("vendor command failure is fail-soft", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("vendor command exit != 0 logs warning, does not throw", async () => {
    await mkdir(join(home, ".claude"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "graphify") return "/usr/local/bin/graphify";
      return null;
    });
    // Simulate graphify failure.
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 1, stdout: "", stderr: "some error" });

    const warnings: string[] = [];
    const warnSpy = spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(String(args[0]));
    });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      // Must not throw.
      await expect(
        runVendorIntegrations(dir, home, { dryRun: false })
      ).resolves.toBeUndefined();

      // Should have logged a warning.
      expect(warnings.some((w) => w.includes("⚠"))).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 14. NO --output flag in any spawn args (graphify + repomix)
// ---------------------------------------------------------------------------

describe("NO --output flag in any graphify or repomix spawn", () => {
  let dir: string;
  let home: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    dir = await freshDir();
    home = await freshDir();
    origHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  });

  test("no --output in any graphify or repomix command", async () => {
    await mkdir(join(home, ".claude"), { recursive: true });

    const proc = await import("../utils/proc.ts");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "graphify" || cmd === "repomix" || cmd === "npx") return `/usr/local/bin/${cmd}`;
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      const { runVendorIntegrations } = await import("./vendor-installs.ts");
      await runVendorIntegrations(dir, home, { dryRun: false });

      for (const call of runSpy.mock.calls) {
        const cmd = Array.isArray(call[0]) ? call[0] : [];
        if (cmd[0] === "graphify" || cmd[0] === "repomix") {
          expect(cmd).not.toContain("--output");
        }
      }
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});
