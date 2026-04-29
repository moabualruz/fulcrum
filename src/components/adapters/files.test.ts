import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyPolicyAction } from "./files.ts";

let tmp: string;
let originalHome: string | undefined;
let originalRepoDir: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fulcrum-component-policy-"));
  originalHome = process.env["HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = tmp;
  process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../../..");
  process.env["FULCRUM_HOME"] = join(tmp, ".fulcrum");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(tmp, { recursive: true, force: true });
});

describe("applyPolicyAction", () => {
  test("installs tool-output policy using scratch FULCRUM_HOME", async () => {
    await applyPolicyAction("install", false);

    const installed = await readFile(join(tmp, ".fulcrum", "tool-output-policy.toml"), "utf8");
    expect(installed).toBe(await readFile(join(__dirname, "../../../config/tool-output-policy.toml"), "utf8"));
  });

  test("remove preserves modified policy unless purge is set", async () => {
    const policyPath = join(tmp, ".fulcrum", "tool-output-policy.toml");
    await mkdir(join(tmp, ".fulcrum"), { recursive: true });
    await writeFile(policyPath, "user = true\n");

    await applyPolicyAction("remove", false);

    expect(await readFile(policyPath, "utf8")).toBe("user = true\n");
  });

  test("purge removes modified policy", async () => {
    const policyPath = join(tmp, ".fulcrum", "tool-output-policy.toml");
    await mkdir(join(tmp, ".fulcrum"), { recursive: true });
    await writeFile(policyPath, "user = true\n");

    await applyPolicyAction("remove", false, true);

    expect(await Bun.file(policyPath).exists()).toBe(false);
  });

  test("dry-run purge preserves modified policy", async () => {
    const policyPath = join(tmp, ".fulcrum", "tool-output-policy.toml");
    await mkdir(join(tmp, ".fulcrum"), { recursive: true });
    await writeFile(policyPath, "user = true\n");

    await applyPolicyAction("remove", true, true);

    expect(await readFile(policyPath, "utf8")).toBe("user = true\n");

    await applyPolicyAction("remove", false, true);

    expect(await Bun.file(policyPath).exists()).toBe(false);
  });
});
