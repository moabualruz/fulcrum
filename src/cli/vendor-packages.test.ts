import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installVendorCapabilityPackages, uninstallVendorCapabilityPackages } from "./vendor-packages.ts";
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
    let calls: unknown[][];
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
});
