import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPolicyAction } from "./adapters/files.ts";
import { executeComponentPlan } from "./executor.ts";
import { planComponentOperation } from "./planner.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;
let originalRepo: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-remove-safety-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepo = process.env["FULCRUM_REPO_DIR"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  if (originalRepo === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = originalRepo;
  await rm(scratch, { recursive: true, force: true });
});

describe("component remove safety", () => {
  test("remove preserves modified policy unless purge is set", async () => {
    const policyPath = join(scratch, ".fulcrum", "tool-output-policy.toml");

    await applyPolicyAction("install", false);
    await Bun.write(policyPath, "user modified\n");
    await applyPolicyAction("remove", false, false);

    expect(await readFile(policyPath, "utf8")).toBe("user modified\n");
  });

  test("purge removes modified policy", async () => {
    const policyPath = join(scratch, ".fulcrum", "tool-output-policy.toml");

    await applyPolicyAction("install", false);
    await Bun.write(policyPath, "user modified\n");
    await applyPolicyAction("remove", false, true);

    expect(await Bun.file(policyPath).exists()).toBe(false);
  });

  test("executor purge removes modified policy", async () => {
    const policyPath = join(scratch, ".fulcrum", "tool-output-policy.toml");

    await applyPolicyAction("install", false);
    await Bun.write(policyPath, "user modified\n");
    await executeComponentPlan(
      planComponentOperation({ operation: "remove", target: "policy.tool-output" }),
      { purge: true },
    );

    expect(await Bun.file(policyPath).exists()).toBe(false);
  });
});
