import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  hasMarker,
  isClaudeCliAllowed,
  listMarkers,
  markerPath,
  markersDir,
  readMarker,
  removeMarker,
  setClaudeCliAllowed,
  shouldInstallClaudePlugin,
  shouldUninstallClaudePlugin,
  writeMarker,
  safeClaudePluginInstall,
  safeClaudePluginUninstall,
} from "../../apps/cli/src/claude-plugin-markers.ts";

let scratch: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalAllow: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-claude-markers-"));
  originalHome = process.env.HOME;
  originalFulcrumHome = process.env.FULCRUM_HOME;
  originalAllow = process.env.FULCRUM_ALLOW_CLAUDE_CLI;
  process.env.HOME = join(scratch, "home");
  process.env.FULCRUM_HOME = join(scratch, "fulcrum-home");
  delete process.env.FULCRUM_ALLOW_CLAUDE_CLI;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalFulcrumHome === undefined) delete process.env.FULCRUM_HOME;
  else process.env.FULCRUM_HOME = originalFulcrumHome;
  if (originalAllow === undefined) delete process.env.FULCRUM_ALLOW_CLAUDE_CLI;
  else process.env.FULCRUM_ALLOW_CLAUDE_CLI = originalAllow;
  await rm(scratch, { recursive: true, force: true });
});

describe("Claude plugin ownership markers", () => {
  it("stores, lists, reads, and removes markers under FULCRUM_HOME", async () => {
    expect(markersDir()).toBe(join(scratch, "fulcrum-home", "state", "global", "claude-plugin-markers"));
    expect(markerPath("fulcrum@moabualruz/fulcrum")).toEndWith("fulcrum__moabualruz__fulcrum.json");
    expect(await hasMarker("fulcrum@moabualruz/fulcrum")).toBe(false);
    expect(await readMarker("fulcrum@moabualruz/fulcrum")).toBeNull();

    await writeMarker({
      plugin: "fulcrum@moabualruz/fulcrum",
      marketplace: "moabualruz/fulcrum",
      source: "test",
      operation: "install",
      fulcrumVersion: "0.0.0-test",
    });
    await writeFile(join(markersDir(), "ignored.txt"), "not json", "utf8");
    await writeFile(join(markersDir(), "broken.json"), "{", "utf8");

    expect(await hasMarker("fulcrum@moabualruz/fulcrum")).toBe(true);
    expect(await readMarker("fulcrum@moabualruz/fulcrum")).toMatchObject({
      plugin: "fulcrum@moabualruz/fulcrum",
      marketplace: "moabualruz/fulcrum",
      source: "test",
      operation: "install",
      fulcrumVersion: "0.0.0-test",
    });
    expect(await listMarkers()).toHaveLength(1);

    const raw = await readFile(markerPath("fulcrum@moabualruz/fulcrum"), "utf8");
    expect(JSON.parse(raw).recordedAt).toBeString();

    await removeMarker("fulcrum@moabualruz/fulcrum");
    expect(await hasMarker("fulcrum@moabualruz/fulcrum")).toBe(false);
  });

  it("gates Claude CLI mutation on explicit allow or marker ownership", async () => {
    expect(isClaudeCliAllowed()).toBe(false);
    expect(await shouldInstallClaudePlugin("owned@market")).toBe(false);
    expect(await shouldUninstallClaudePlugin("owned@market")).toBe(false);

    setClaudeCliAllowed(true);
    expect(isClaudeCliAllowed()).toBe(true);
    expect(await shouldInstallClaudePlugin("owned@market")).toBe(true);
    setClaudeCliAllowed(false);
    expect(isClaudeCliAllowed()).toBe(false);

    await writeMarker({ plugin: "owned@market", operation: "install" });
    expect(await shouldInstallClaudePlugin("owned@market")).toBe(true);
    expect(await shouldUninstallClaudePlugin("owned@market")).toBe(true);
  });

  it("safe install and uninstall skip without mutating when dry-run or ownership is absent", async () => {
    await expect(safeClaudePluginInstall("external@market", { dryRun: true })).resolves.toEqual({
      ran: false,
      ok: true,
      reason: "dry-run",
    });
    await expect(safeClaudePluginInstall("external@market")).resolves.toMatchObject({
      ran: false,
      ok: true,
      reason: "confirmation required; pass --allow-claude-cli to opt in",
    });
    await expect(safeClaudePluginUninstall("external@market", { dryRun: true })).resolves.toEqual({
      ran: false,
      ok: true,
      reason: "dry-run",
    });
    await expect(safeClaudePluginUninstall("external@market")).resolves.toMatchObject({
      ran: false,
      ok: true,
      reason: "no-marker; manual command required",
    });
  });
});
