import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyHookAction } from "./hooks.ts";
import type { ComponentAction } from "../types.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-hook-adapter-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("hook component adapter", () => {
  test("enable writes Codex hook config and marker", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });

    await applyHookAction(hookAction({ change: "enable", operation: "enable" }));

    const hooks = JSON.parse(await readFile(join(scratch, ".codex", "hooks.json"), "utf8"));
    expect(hooks.hooks.PostToolUse[0].hooks[0]).toMatchObject({
      type: "command",
      command: "fulcrum hook format",
    });
    expect(await Bun.file(join(scratch, ".fulcrum", "hooks", "enabled", "format")).exists()).toBe(true);
  });

  test("disable removes Codex hook config and marker", async () => {
    await mkdir(join(scratch, ".codex"), { recursive: true });
    await applyHookAction(hookAction({ change: "enable", operation: "enable" }));

    await applyHookAction(hookAction({ change: "disable", operation: "disable" }));

    expect(await Bun.file(join(scratch, ".codex", "hooks.json")).exists()).toBe(false);
    expect(await Bun.file(join(scratch, ".fulcrum", "hooks", "enabled", "format")).exists()).toBe(false);
  });

  test("throws for missing recipe", async () => {
    const action = hookAction({ payload: {} });
    await expect(applyHookAction(action)).rejects.toThrow("hook action requires string payload.recipe");
  });

  test("throws for missing agent", async () => {
    const action = hookAction({});
    delete action.agentId;
    await expect(applyHookAction(action)).rejects.toThrow("hook action requires agentId");
  });

  test("throws for unsupported action kind", async () => {
    const action = hookAction({ kind: "json-patch" });
    await expect(applyHookAction(action)).rejects.toThrow(
      "unsupported hook action kind: json-patch",
    );
  });

  test("throws for unknown recipe", async () => {
    const action = hookAction({ payload: { recipe: "missing-recipe" } });
    await expect(applyHookAction(action)).rejects.toThrow("unknown hook recipe: missing-recipe");
    expect(
      await Bun.file(join(scratch, ".fulcrum", "hooks", "enabled", "missing-recipe")).exists(),
    ).toBe(false);
  });

  test("throws for unsupported change", async () => {
    const action = hookAction({ change: "replace" as ComponentAction["change"] });
    await expect(applyHookAction(action)).rejects.toThrow("unsupported hook action change: replace");
  });
});

function hookAction(overrides: Partial<ComponentAction>): ComponentAction {
  return {
    id: "hooks.format:codex:enable",
    componentId: "hooks.format",
    surfaceId: "hooks.format:registration",
    agentId: "codex",
    operation: "enable",
    kind: "hook-registration",
    target: "hook:format",
    change: "enable",
    risk: "managed",
    reason: "enable hooks.format via hook-registration",
    payload: { recipe: "format" },
    ...overrides,
  };
}
