import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installRepomixPackageMirrors, uninstallRepomixPackageMirrors } from "./repomix-package.ts";

let TMP: string;
let originalHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-repomix-package-"));
  originalHome = process.env["HOME"];
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
  await rm(TMP, { recursive: true, force: true });
});

describe("Repomix capability package mirrors", () => {
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
});
