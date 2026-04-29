import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installRepomixClaudePlugins,
  installRepomixPackageMirrors,
  uninstallRepomixClaudePlugins,
  uninstallRepomixPackageMirrors,
} from "./repomix-package.ts";
import * as proc from "../utils/proc.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-repomix-package-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;

  await mkdir(join(TMP, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands"), { recursive: true });
  await mkdir(join(TMP, ".claude", "plugins", "cache", "repomix", "repomix-explorer", "1.1.0", "agents"), { recursive: true });
  await writeFile(join(TMP, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands", "pack-local.md"), "---\ndescription: Pack local\n---\n\nRun local repomix.\n");
  await writeFile(join(TMP, ".claude", "plugins", "cache", "repomix", "repomix-commands", "1.0.2", "commands", "pack-remote.md"), "---\ndescription: Pack remote\n---\n\nRun remote repomix.\n");
  await writeFile(join(TMP, ".claude", "plugins", "cache", "repomix", "repomix-explorer", "1.1.0", "agents", "explorer.md"), "---\nname: explorer\ndescription: Explore repos\n---\n\nExplore with repomix.\n");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

describe("Repomix capability package mirrors", () => {
  test("dry-run Repomix Claude plugin install previews commands without claude on PATH", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installRepomixClaudePlugins({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin marketplace add yamadashy/repomix");
    expect(logs).toContain("     [dry-run] would run: claude plugin install repomix-mcp@repomix");
  });

  test("dry-run Repomix Claude plugin uninstall previews commands without claude on PATH", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallRepomixClaudePlugins({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall repomix-mcp@repomix");
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall repomix-explorer@repomix");
  });

  test("dry-run Repomix mirror reports clone plan and unavailable writes when source cache is absent", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await rm(join(TMP, ".claude", "plugins", "cache", "repomix"), { recursive: true, force: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installRepomixPackageMirrors({ dryRun: true });
    } finally {
      logSpy.mockRestore();
    }
    expect(logs).toContain(`     [dry-run] would clone/update https://github.com/yamadashy/repomix → ${join(TMP, ".fulcrum", "cache", "repomix")}`);
    expect(logs).toContain(`     [dry-run] would write: ${join(TMP, ".codex", "skills", "repomix-pack-local", "SKILL.md")}`);
    expect(logs).toContain("     [dry-run] Repomix package mirror plan unavailable until source cache exists");
  });

  test("uninstall preserves user-installed Repomix Claude plugins when Fulcrum marker is absent", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/claude");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallRepomixClaudePlugins();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     · skip repomix Claude plugins uninstall (Fulcrum marker not present)");
  });

  test("installs Repomix Claude plugins and writes marker", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installRepomixClaudePlugins();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "marketplace", "add", "yamadashy/repomix"],
      ["claude", "plugin", "install", "repomix-mcp@repomix"],
      ["claude", "plugin", "install", "repomix-commands@repomix"],
      ["claude", "plugin", "install", "repomix-explorer@repomix"],
    ]);
    expect(await Bun.file(join(TMP, ".fulcrum", "state", "global", "repomix-claude.installed")).exists()).toBe(true);
  });

  test("dry-run Repomix Claude plugin install logs commands without running or writing marker", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installRepomixClaudePlugins({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin marketplace add yamadashy/repomix");
    expect(logs).toContain("     [dry-run] would run: claude plugin install repomix-mcp@repomix");
    expect(await Bun.file(join(TMP, ".fulcrum", "state", "global", "repomix-claude.installed")).exists()).toBe(false);
  });

  test("uninstalls Repomix Claude plugins and removes marker", async () => {
    process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "repomix-claude.installed"), "installed\n");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await uninstallRepomixClaudePlugins();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "uninstall", "repomix-mcp@repomix"],
      ["claude", "plugin", "uninstall", "repomix-commands@repomix"],
      ["claude", "plugin", "uninstall", "repomix-explorer@repomix"],
    ]);
    expect(await Bun.file(join(TMP, ".fulcrum", "state", "global", "repomix-claude.installed")).exists()).toBe(false);
  });

  test("installs nearest native mirrors for non-Claude agents", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });

    await installRepomixPackageMirrors();

    expect(await readFile(join(TMP, ".codex", "skills", "repomix-pack-local", "SKILL.md"), "utf8")).toContain("Run local repomix.");
    const geminiManifest = JSON.parse(await readFile(join(TMP, ".gemini", "extensions", "repomix", "gemini-extension.json"), "utf8"));
    expect(geminiManifest.mcpServers.repomix.command).toBe("npx");
    expect(await readFile(join(TMP, ".gemini", "extensions", "repomix", "commands", "pack-local.toml"), "utf8")).toContain("Run local repomix.");
    expect(await readFile(join(TMP, ".config", "opencode", "agents", "repomix-explorer.md"), "utf8")).toContain("Explore with repomix.");
    expect(await readFile(join(TMP, ".pi", "agent", "skills", "repomix-explorer", "SKILL.md"), "utf8")).toContain("Explore with repomix.");
  });

  test("uninstalls mirrored package surfaces", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await installRepomixPackageMirrors();

    await uninstallRepomixPackageMirrors();

    expect(await Bun.file(join(TMP, ".codex", "skills", "repomix-pack-local")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "repomix")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".config", "opencode", "skills", "repomix-explorer")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".config", "opencode", "agents", "repomix-explorer.md")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "repomix-pack-remote")).exists()).toBe(false);
  });

  test("uninstall preserves user-owned Repomix mirrors when Fulcrum marker is absent", async () => {
    await mkdir(join(TMP, ".codex", "skills", "repomix-pack-local"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "repomix-pack-local", "SKILL.md"), "user copy\n");
    await mkdir(join(TMP, ".gemini", "extensions", "repomix"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "extensions", "repomix", "gemini-extension.json"), "{}\n");

    await uninstallRepomixPackageMirrors();

    expect(await readFile(join(TMP, ".codex", "skills", "repomix-pack-local", "SKILL.md"), "utf8")).toContain("user copy");
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "repomix", "gemini-extension.json")).exists()).toBe(true);
  });
});
