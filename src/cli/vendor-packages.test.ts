import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  installVendorCapabilityPackages,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
  uninstallVendorCapabilityPackages,
} from "./vendor-packages.ts";
import * as proc from "../utils/proc.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-vendor-packages-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");

  const skill = join(TMP, ".fulcrum", "cache", "superpowers", "skills", "brainstorming");
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: brainstorming\ndescription: Brainstorm\n---\n\nUse structured brainstorming.\n");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

describe("vendor capability packages", () => {
  test("dry-run Cloudflare install previews Claude commands without claude on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installCloudflarePackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin marketplace add cloudflare/skills");
    expect(logs).toContain("     [dry-run] would run: claude plugin install cloudflare@cloudflare");
  });

  test("dry-run Superpowers install previews Gemini and Pi commands without CLIs on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: gemini extensions install https://github.com/obra/superpowers --consent --skip-settings");
    expect(logs).toContain("     [dry-run] would run: pi install https://github.com/obra/superpowers");
    expect(logs).toContain("     [dry-run] would run: pi install npm:@tintinweb/pi-subagents");
    expect(logs).toContain("     [dry-run] would run: pi install npm:@uadgj/pi-superpowers-support");
  });

  test("dry-run vendor uninstall previews native commands without CLIs on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallCloudflarePackage({ dryRun: true });
      await uninstallSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall cloudflare@cloudflare");
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall superpowers@claude-plugins-official");
    expect(logs).toContain("     [dry-run] would run: gemini extensions uninstall superpowers");
    expect(logs).toContain("     [dry-run] would run: pi remove https://github.com/obra/superpowers");
  });

  test("dry-run Superpowers mirror reports clone plan and unavailable writes when source cache is absent", async () => {
    await rm(join(TMP, ".fulcrum", "cache", "superpowers"), { recursive: true, force: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await installSuperpowersPackage({ dryRun: true });
    } finally {
      whichSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(logs).toContain(`     [dry-run] would clone/update https://github.com/obra/superpowers → ${join(TMP, ".fulcrum", "cache", "superpowers")}`);
    expect(logs).toContain("     [dry-run] Superpowers skills mirror plan unavailable until source cache exists");
  });

  test("uninstall preserves user-installed Cloudflare Claude plugin when Fulcrum marker is absent", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/claude");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await uninstallCloudflarePackage();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     · skip Cloudflare Claude plugin uninstall (Fulcrum marker not present)");
  });

  test("uninstall preserves user-installed Superpowers native packages when Fulcrum markers are absent", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "extensions", "superpowers", "extension.json"), "{}\n");
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "opencode.json"), JSON.stringify({
      plugin: ["superpowers@git+https://github.com/obra/superpowers.git"],
    }, null, 2) + "\n");
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await writeFile(join(TMP, ".pi", "agent", "settings.json"), JSON.stringify({
      packages: ["https://github.com/obra/superpowers"],
    }, null, 2) + "\n");
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/tool");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    try {
      await uninstallSuperpowersPackage();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toContain("superpowers@git+https://github.com/obra/superpowers.git");
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "superpowers", "extension.json")).exists()).toBe(true);
  });

  test("installs only the Cloudflare Claude plugin for the Cloudflare package", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installCloudflarePackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "marketplace", "add", "cloudflare/skills"],
      ["claude", "plugin", "install", "cloudflare@cloudflare"],
    ]);
  });

  test("uninstalls only the Cloudflare Claude plugin for the Cloudflare package", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "cloudflare-claude.installed"), "installed\n");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await uninstallCloudflarePackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toEqual([
      ["claude", "plugin", "uninstall", "cloudflare@cloudflare"],
    ]);
  });

  test("installs Superpowers package surfaces without Cloudflare", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".codex"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installSuperpowersPackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["claude", "plugin", "install", "superpowers@claude-plugins-official"]);
    expect(calls).not.toContainEqual(["claude", "plugin", "install", "cloudflare@cloudflare"]);
    expect(await readFile(join(TMP, ".codex", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
  });

  test("uninstalls Superpowers package surfaces without Cloudflare", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "superpowers-claude.installed"), "installed\n");
    await mkdir(join(TMP, ".codex", "skills", "superpowers", "brainstorming"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await uninstallSuperpowersPackage();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["claude", "plugin", "uninstall", "superpowers@claude-plugins-official"]);
    expect(calls).not.toContainEqual(["claude", "plugin", "uninstall", "cloudflare@cloudflare"]);
    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers")).exists()).toBe(false);
  });

  test("mirrors Superpowers full skills for Codex/Pi and registers OpenCode plugin", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installVendorCapabilityPackages();
    } finally {
      whichSpy.mockRestore();
    }

    expect(await readFile(join(TMP, ".codex", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
    expect(await readFile(join(TMP, ".pi", "agent", "skills", "superpowers", "brainstorming", "SKILL.md"), "utf8"))
      .toContain("Use structured brainstorming.");
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toContain("superpowers@git+https://github.com/obra/superpowers.git");
  });

  test("uninstalls mirrored Superpowers package surfaces", async () => {
    await mkdir(join(TMP, ".codex"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installVendorCapabilityPackages();

      await uninstallVendorCapabilityPackages();
    } finally {
      whichSpy.mockRestore();
    }

    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "superpowers")).exists()).toBe(false);
    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toBeUndefined();
  });

  test("uses Pi packages for Superpowers when pi is available", async () => {
    await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "pi" ? "/usr/local/bin/pi" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    let calls: unknown[][] = [];
    try {
      await installVendorCapabilityPackages();
      calls = runSpy.mock.calls.map((call) => call[0]);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(calls).toContainEqual(["pi", "install", "https://github.com/obra/superpowers"]);
    expect(calls).toContainEqual(["pi", "install", "npm:@tintinweb/pi-subagents"]);
    expect(calls).toContainEqual(["pi", "install", "npm:@uadgj/pi-superpowers-support"]);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "superpowers")).exists()).toBe(false);
  });

  test("does not reinstall existing Superpowers Gemini extension", async () => {
    await mkdir(join(TMP, ".gemini", "extensions", "superpowers"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue("/usr/local/bin/gemini");
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 1, stdout: "", stderr: "already installed" });
    try {
      await installVendorCapabilityPackages();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
    expect(runSpy.mock.calls).not.toContainEqual([
      ["gemini", "extensions", "install", "https://github.com/obra/superpowers", "--consent", "--skip-settings"],
      { timeoutMs: 60_000 },
    ]);
  });
});
