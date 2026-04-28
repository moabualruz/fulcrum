import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeExactLine, removeSentinelBlock, run, setDryRun } from "./uninstall.ts";
import * as proc from "../utils/proc.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalRepoDir: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-uninstall-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = TMP;
  setDryRun(false);
});

afterEach(async () => {
  setDryRun(false);
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  await rm(TMP, { recursive: true, force: true });
});

describe("removeSentinelBlock", () => {
  test("removes only Fulcrum rules block and preserves user content", async () => {
    const file = join(TMP, "AGENTS.md");
    await writeFile(
      file,
      [
        "# User rules",
        "",
        "<!-- BEGIN FULCRUM RULES -->",
        "managed",
        "<!-- END FULCRUM RULES -->",
        "",
        "Keep me",
        "",
      ].join("\n"),
    );

    await removeSentinelBlock(file, "Test");

    expect(await readFile(file, "utf8")).toBe("# User rules\n\nKeep me\n");
  });

  test("refuses mismatched markers", async () => {
    const file = join(TMP, "bad.md");
    await writeFile(file, "<!-- BEGIN FULCRUM RULES -->\nmanaged\n");

    await removeSentinelBlock(file, "Bad");

    expect(await readFile(file, "utf8")).toBe("<!-- BEGIN FULCRUM RULES -->\nmanaged\n");
  });
});

describe("removeExactLine", () => {
  test("removes only the generated Gemini import line", async () => {
    const file = join(TMP, "GEMINI.md");
    await writeFile(file, "before\n@AGENTS.md\nafter\n");

    await removeExactLine(file, "@AGENTS.md", "Gemini import");

    expect(await readFile(file, "utf8")).toBe("before\nafter\n");
  });
});

describe("run", () => {
  test("removes managed namespaces, hook state, and unmodified policy", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");

    await mkdir(join(TMP, ".fulcrum", "hooks", "snippets"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "hooks", "enabled"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "default = true\n");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await writeFile(
      join(TMP, ".claude", "settings.json"),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "fulcrum hook index-check" }] }] } }, null, 2) + "\n",
    );
    await mkdir(join(TMP, ".config", "opencode", "plugins"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts"), "managed\n");

    await mkdir(join(TMP, ".codex", "skills", "fulcrum", "jq"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "fulcrum-upstream", "ast-grep"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-skills", "skills", "jq"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills", "skills", "ast-grep"), { recursive: true });
    await writeFile(join(TMP, ".codex", "AGENTS.md"), "user\n<!-- BEGIN FULCRUM RULES -->\nmanaged\n<!-- END FULCRUM RULES -->\n");
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "GEMINI.md"), "@AGENTS.md\n");

    await run([]);

    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum-upstream")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "snippets")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "tool-output-policy.toml")).exists()).toBe(false);
    expect(await readFile(join(TMP, ".codex", "AGENTS.md"), "utf8")).toBe("user\n");
    expect(await readFile(join(TMP, ".gemini", "GEMINI.md"), "utf8")).toBe("");
  });

  test("keeps modified policy without --purge", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "user = true\n");

    await run([]);

    expect(await readFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "utf8")).toBe("user = true\n");
  });
});

// ---------------------------------------------------------------------------
// W1.1 — caveman Claude uninstall: `claude plugin uninstall caveman@caveman`
// ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.1 Claude plugin uninstall", () => {
  test("calls claude plugin uninstall when .claude exists and claude on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    // Create the caveman install dir so removePath has something to clean up.
    await mkdir(join(TMP, ".claude", "plugins", "cache", "caveman", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "claude") return "/usr/local/bin/claude";
      if (cmd === "npx") return null;
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const claudeUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd.includes("plugin") && cmd.includes("uninstall") && cmd.includes("caveman@caveman"),
      );
      expect(claudeUninstall).toBeDefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("skips claude uninstall when .claude dir absent", async () => {
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const claudeUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd.includes("plugin") && cmd.includes("uninstall"),
      );
      expect(claudeUninstall).toBeUndefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("logs and continues when claude plugin uninstall exits non-zero (best-effort)", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "claude") return "/usr/local/bin/claude";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 1, stdout: "", stderr: "not found" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
    try {
      // Must not throw even though run returns non-zero.
      await expect(run(["--include-caveman"])).resolves.toBeUndefined();
      expect(logs.some((l) => l.includes("continuing"))).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// W2 — MCP registry uninstall
// ---------------------------------------------------------------------------

import { registerServer, DEFAULT_GITHUB_SERVER, DEFAULT_REPOMIX_SERVER } from "./mcp-registry.ts";

describe("uninstall MCP registry (W2)", () => {
  test("registry file deleted by default (no --keep-state)", async () => {
    const stateDir = join(TMP, ".fulcrum", "state", "global");
    await mkdir(stateDir, { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await registerServer("repomix", DEFAULT_REPOMIX_SERVER);

    await run([]);

    const registryFile = join(TMP, ".fulcrum", "state", "global", "mcp-registry.toml");
    expect(await Bun.file(registryFile).exists()).toBe(false);
  });

  test("--keep-state preserves registry file", async () => {
    const stateDir = join(TMP, ".fulcrum", "state", "global");
    await mkdir(stateDir, { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);

    await run(["--keep-state"]);

    const registryFile = join(TMP, ".fulcrum", "state", "global", "mcp-registry.toml");
    expect(await Bun.file(registryFile).exists()).toBe(true);
  });

  test("uninstall when registry not present does not throw", async () => {
    // No registry file created.
    await expect(run([])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// W1.2 — caveman Gemini uninstall: `gemini extensions uninstall caveman`
// ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.2 Gemini extension uninstall", () => {
  test("calls gemini extensions uninstall when .gemini exists and gemini on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "gemini") return "/usr/local/bin/gemini";
      if (cmd === "npx") return null;
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const geminiUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "gemini" && cmd.includes("uninstall") && cmd.includes("caveman"),
      );
      expect(geminiUninstall).toBeDefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("skips gemini uninstall when gemini not on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const geminiUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "gemini" && cmd.includes("uninstall"),
      );
      expect(geminiUninstall).toBeUndefined();
      expect(logs.some((l) => l.includes("not on PATH"))).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// W1.4 — caveman Codex/OpenCode/Pi uninstall via `npx skills remove caveman`
// ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.4 npx skills remove", () => {
  test("calls npx skills remove caveman for each detected agent when npx available", async () => {
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode", "skills", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent", "skills", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "npx") return "/usr/local/bin/npx";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const npxRemovals = calls.filter(
        (cmd) => Array.isArray(cmd) && cmd[0] === "npx" && cmd.includes("remove") && cmd.includes("caveman"),
      );
      // Should have been called at least once per detected agent (3 agents).
      expect(npxRemovals.length).toBeGreaterThanOrEqual(3);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("falls back to removePath when npx not on PATH", async () => {
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const npxCall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "npx",
      );
      expect(npxCall).toBeUndefined();
      // The caveman skill dir should be removed by fs fallback.
      expect(await Bun.file(join(TMP, ".codex", "skills", "caveman")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});
