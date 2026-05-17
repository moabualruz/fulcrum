import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  installVendorCapabilityPackages,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
  uninstallVendorCapabilityPackages,
} from "../../apps/cli/src/vendor-packages.ts";
import { loadRegistry, registerServer } from "../../apps/cli/src/mcp-registry.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...parts: unknown[]) => { logs.push(parts.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return logs;
}

async function writePackageSource(root: string, name: string): Promise<void> {
  await mkdir(join(root, "skills", "tool-a"), { recursive: true });
  await mkdir(join(root, "rules"), { recursive: true });
  await mkdir(join(root, "hooks"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "memory"), { recursive: true });
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "examples"), { recursive: true });
  await mkdir(join(root, "tests"), { recursive: true });
  await writeFile(join(root, "skills", "tool-a", "SKILL.md"), `---\nname: ${name}-tool\ndescription: ${name} test skill\n---\n\nUse ${name}.`);
  await writeFile(join(root, "rules", "base.md"), `# ${name} rules`);
  await writeFile(join(root, "hooks", "hook.json"), JSON.stringify({ name: `${name}-hook` }));
  await writeFile(join(root, "tools", "tool.sh"), "#!/bin/sh\n");
  await writeFile(join(root, "memory", "README.md"), `${name} memory`);
  await writeFile(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name }));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: `${name}-pkg` }));
  await writeFile(join(root, ".mcp.json"), JSON.stringify({
    mcpServers: {
      [`${name}-http`]: {
        type: "http",
        url: `https://example.com/${name}/mcp`,
        headers: { Authorization: `Bearer \${${name.toUpperCase()}_TOKEN}` },
      },
      [`${name}-stdio`]: {
        command: "node",
        args: ["server.js"],
        auth_env_vars: [`${name.toUpperCase()}_STDIO_TOKEN`],
      },
      [`${name}-bad`]: { type: "weird" },
    },
  }, null, 2));
  await writeFile(join(root, "README.md"), `${name} readme`);
  await writeFile(join(root, "assets", "sample.txt"), "asset");
  await writeFile(join(root, "examples", "sample.txt"), "unknown asset");
  await writeFile(join(root, "tests", "fixture.txt"), "must not be mirrored");
  await writeFile(join(root, "tool-a.original.md"), "must not be mirrored");
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-vendor-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  await mkdir(process.env["HOME"]!, { recursive: true });
  await writePackageSource(join(process.env["FULCRUM_HOME"]!, "cache", "cloudflare-skills"), "cloudflare");
  await writePackageSource(join(process.env["FULCRUM_HOME"]!, "cache", "superpowers"), "superpowers");
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("vendor capability package mirrors", () => {
  it("skips mirror installs when no fallback agent roots are detected", async () => {
    const logs = await captureLogs(() => installCloudflarePackage({ agents: ["codex"] }));
    expect(logs.join("\n")).toContain("no non-native fallback agents detected");
  });

  it("installs and removes Cloudflare package payload mirrors with metadata", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });

    await installCloudflarePackage({ agents: ["codex", "gemini", "opencode"] });

    const codexMetadata = JSON.parse(await readFile(join(home, ".codex", "plugins", "cache", "cloudflare", "cloudflare", "1.0.0", "fulcrum-package-mirror.json"), "utf8"));
    expect(codexMetadata.package).toBe("cloudflare");
    expect(codexMetadata.mirroredSurfaces).toContain("skills");
    expect(codexMetadata.mirroredSurfaces).toContain("hooks");
    expect(codexMetadata.mirroredSurfaces).toContain("tools");
    expect(codexMetadata.mirroredSurfaces).toContain("context");
    expect(codexMetadata.mirroredSurfaces).toContain("metadata");
    expect(codexMetadata.unknownAssets).toContain("examples");
    expect(codexMetadata.unsupported.hooks).toContain("not auto-executed");
    expect(codexMetadata.unsupported.tools).toContain("not auto-executed");
    expect(await readFile(join(home, ".codex", "skills", "cloudflare", "tool-a", "SKILL.md"), "utf8")).toContain("Use cloudflare.");
    expect(await exists(join(home, ".codex", "plugins", "cache", "cloudflare", "cloudflare", "1.0.0", "tests", "fixture.txt"))).toBe(false);
    expect(await exists(join(home, ".codex", "plugins", "cache", "cloudflare", "cloudflare", "1.0.0", "tool-a.original.md"))).toBe(false);
    expect(JSON.parse(await readFile(join(home, ".gemini", "extensions", "cloudflare", "gemini-extension.json"), "utf8")).name).toBe("cloudflare");
    const geminiMetadata = JSON.parse(await readFile(join(home, ".gemini", "extensions", "cloudflare", "fulcrum-package-mirror.json"), "utf8"));
    expect(geminiMetadata.targetAgent).toBe("gemini");
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "cloudflare-mirrors.installed"))).toBe(true);

    await uninstallCloudflarePackage({ agents: ["codex", "gemini", "opencode"] });

    expect(await exists(join(home, ".codex", "skills", "cloudflare"))).toBe(false);
    expect(await exists(join(home, ".gemini", "extensions", "cloudflare"))).toBe(false);
    expect(await exists(join(home, ".config", "opencode", "packages", "cloudflare"))).toBe(false);
    expect(await exists(join(process.env["FULCRUM_HOME"]!, "state", "global", "cloudflare-mirrors.installed"))).toBe(false);
  });

  it("registers and removes package MCP manifests without deleting shared visibility", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await registerServer("cloudflare-http", {
      transport: "http",
      url: "https://existing.example/mcp",
      description: "existing package server",
      vendor: "cloudflare",
      default_enabled: false,
      auth_env_vars: ["EXISTING_TOKEN"],
      agent_visibility: {
        "claude-code": true,
        codex: false,
        gemini: false,
        opencode: false,
        pi: false,
      },
    });

    const logs = await captureLogs(() => installCloudflarePackage({ agents: ["codex", "pi"] }));
    expect(logs.join("\n")).toContain("cloudflare package MCP registered disabled: cloudflare-http");
    expect(logs.join("\n")).toContain("cloudflare package MCP cloudflare-bad has unsupported shape; skip");

    const installedRegistry = await loadRegistry();
    expect(installedRegistry.servers["cloudflare-http"]?.auth_env_vars).toEqual(["CLOUDFLARE_TOKEN", "EXISTING_TOKEN"]);
    expect(installedRegistry.servers["cloudflare-http"]?.agent_visibility).toMatchObject({
      "claude-code": true,
      codex: true,
      pi: true,
    });
    expect(installedRegistry.servers["cloudflare-stdio"]?.command).toBe("node server.js");
    expect(installedRegistry.servers["cloudflare-stdio"]?.auth_env_vars).toEqual(["CLOUDFLARE_STDIO_TOKEN"]);

    await uninstallCloudflarePackage({ agents: ["codex", "pi"] });
    const removedRegistry = await loadRegistry();
    expect(removedRegistry.servers["cloudflare-http"]?.agent_visibility).toMatchObject({
      "claude-code": true,
      codex: false,
      pi: false,
    });
    expect(removedRegistry.servers["cloudflare-stdio"]).toBeUndefined();
  });

  it("honors Fulcrum ownership metadata before overwriting loadable skill mirrors", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex", "skills", "cloudflare", "tool-a"), { recursive: true });
    await writeFile(join(home, ".codex", "skills", "cloudflare", "tool-a", "SKILL.md"), "user-owned skill");

    await installCloudflarePackage({ agents: ["codex"] });

    expect(await readFile(join(home, ".codex", "skills", "cloudflare", "tool-a", "SKILL.md"), "utf8")).toBe("user-owned skill");
    expect(await readFile(join(home, ".codex", "plugins", "cache", "cloudflare", "cloudflare", "1.0.0", "skills", "tool-a", "SKILL.md"), "utf8")).toContain("Use cloudflare.");
  });

  it("installs and removes Superpowers agent integrations and skill mirrors", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await writeFile(join(home, ".config", "opencode", "opencode.json"), JSON.stringify({ plugin: ["existing"] }, null, 2));

    await installSuperpowersPackage({ agents: ["codex", "opencode"] });

    expect(await readFile(join(home, ".codex", "skills", "superpowers", "tool-a", "SKILL.md"), "utf8")).toContain("Use superpowers.");
    const opencode = JSON.parse(await readFile(join(home, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.plugin).toContain("superpowers@git+https://github.com/obra/superpowers.git");

    const guarded = await captureLogs(() => uninstallSuperpowersPackage({ agents: ["pi"] }));
    expect(guarded.join("\n")).toContain("Superpowers Pi package removal");

    await uninstallSuperpowersPackage({ agents: ["codex", "opencode"] });

    expect(await exists(join(home, ".codex", "skills", "superpowers"))).toBe(false);
    const after = JSON.parse(await readFile(join(home, ".config", "opencode", "opencode.json"), "utf8"));
    expect(after.plugin).toEqual(["existing"]);
  });

  it("previews native plugin operations and aggregate install/uninstall paths in dry-run mode", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".claude"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });

    const installLogs = await captureLogs(() => installVendorCapabilityPackages({ dryRun: true, agents: ["claude-code", "gemini", "pi"] }));
    expect(installLogs.join("\n")).toContain("would run: claude plugin marketplace add cloudflare/skills");
    expect(installLogs.join("\n")).toContain("would run: gemini extensions install");
    expect(installLogs.join("\n")).toContain("would run: pi install");

    const uninstallLogs = await captureLogs(() => uninstallVendorCapabilityPackages({ dryRun: true, agents: ["claude-code", "gemini", "pi"] }));
    expect(uninstallLogs.join("\n")).toContain("would run: claude plugin uninstall cloudflare@cloudflare");
    expect(uninstallLogs.join("\n")).toContain("would run: pi remove");
  });
});
