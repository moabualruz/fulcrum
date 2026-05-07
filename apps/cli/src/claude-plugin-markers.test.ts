import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
} from "./claude-plugin-markers.ts";

let scratch: string;
let originalFulcrumHome: string | undefined;
let originalAllow: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-claude-markers-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalAllow = process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
  delete process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  if (originalAllow === undefined) delete process.env["FULCRUM_ALLOW_CLAUDE_CLI"];
  else process.env["FULCRUM_ALLOW_CLAUDE_CLI"] = originalAllow;
  await rm(scratch, { recursive: true, force: true });
});

describe("claude plugin markers", () => {
  test("write/read/remove round trip", async () => {
    expect(await hasMarker("fulcrum@fulcrum")).toBe(false);
    await writeMarker({
      plugin: "fulcrum@fulcrum",
      marketplace: "moabualruz/fulcrum",
      source: "skills.authored",
      operation: "install",
      fulcrumVersion: "0.1.0",
    });
    expect(await hasMarker("fulcrum@fulcrum")).toBe(true);
    const marker = await readMarker("fulcrum@fulcrum");
    expect(marker?.plugin).toBe("fulcrum@fulcrum");
    expect(marker?.marketplace).toBe("moabualruz/fulcrum");
    expect(marker?.recordedAt).toBeTruthy();
    await removeMarker("fulcrum@fulcrum");
    expect(await hasMarker("fulcrum@fulcrum")).toBe(false);
  });

  test("listMarkers returns every recorded marker", async () => {
    await writeMarker({ plugin: "a@a", operation: "install" });
    await writeMarker({ plugin: "b@b", operation: "install" });
    const markers = await listMarkers();
    expect(markers.map((m) => m.plugin).sort()).toEqual(["a@a", "b@b"]);
  });

  test("shouldInstallClaudePlugin: marker present → true", async () => {
    await writeMarker({ plugin: "x@x", operation: "install" });
    expect(await shouldInstallClaudePlugin("x@x")).toBe(true);
  });

  test("shouldInstallClaudePlugin: no marker, no opt-in → false", async () => {
    expect(await shouldInstallClaudePlugin("x@x")).toBe(false);
  });

  test("shouldInstallClaudePlugin: opt-in flag → true", async () => {
    setClaudeCliAllowed(true);
    expect(isClaudeCliAllowed()).toBe(true);
    expect(await shouldInstallClaudePlugin("x@x")).toBe(true);
    setClaudeCliAllowed(false);
  });

  test("shouldUninstallClaudePlugin: marker required, opt-in does not bypass", async () => {
    expect(await shouldUninstallClaudePlugin("x@x")).toBe(false);
    setClaudeCliAllowed(true);
    expect(await shouldUninstallClaudePlugin("x@x")).toBe(false);
    await writeMarker({ plugin: "x@x", operation: "install" });
    expect(await shouldUninstallClaudePlugin("x@x")).toBe(true);
    setClaudeCliAllowed(false);
  });

  test("markerPath sanitises filesystem-unfriendly characters", async () => {
    expect(markerPath("a/b@c")).toBe(join(markersDir(), "a__b__c.json"));
  });

  test("safeClaudePluginInstall skips without opt-in or marker", async () => {
    const { safeClaudePluginInstall } = await import("./claude-plugin-markers.ts");
    const result = await safeClaudePluginInstall("nope@nope");
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("confirmation required");
    expect(await hasMarker("nope@nope")).toBe(false);
  });

  test("safeClaudePluginInstall reports confirmation required before Claude CLI mutation", async () => {
    const { safeClaudePluginInstall } = await import("./claude-plugin-markers.ts");
    const result = await safeClaudePluginInstall("fulcrum@fulcrum", {
      marketplace: "moabualruz/fulcrum",
      source: "package.fulcrum",
    });
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("confirmation required");
    expect(await hasMarker("fulcrum@fulcrum")).toBe(false);
  });

  test("safeClaudePluginUninstall refuses without a marker even when opt-in is set", async () => {
    const { safeClaudePluginUninstall } = await import("./claude-plugin-markers.ts");
    setClaudeCliAllowed(true);
    const result = await safeClaudePluginUninstall("ghost@ghost");
    expect(result.ran).toBe(false);
    expect(result.reason).toContain("no-marker");
    setClaudeCliAllowed(false);
  });

  test("safeClaudePluginInstall dry-run never invokes the CLI", async () => {
    const { safeClaudePluginInstall } = await import("./claude-plugin-markers.ts");
    setClaudeCliAllowed(true);
    const result = await safeClaudePluginInstall("never@never", { dryRun: true });
    expect(result.ran).toBe(false);
    expect(result.reason).toBe("dry-run");
    expect(await hasMarker("never@never")).toBe(false);
    setClaudeCliAllowed(false);
  });
});
