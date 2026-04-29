import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyRulesAction } from "./sentinel.ts";

let tmp: string;
let originalHome: string | undefined;
let originalRepoDir: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fulcrum-component-rules-"));
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

describe("applyRulesAction", () => {
  test("installs and removes Fulcrum rules block for detected Codex rules file", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });

    await applyRulesAction("install", false);

    const rulesPath = join(tmp, ".codex", "AGENTS.md");
    expect(await readFile(rulesPath, "utf8")).toContain("<!-- BEGIN FULCRUM RULES -->");

    await applyRulesAction("remove", false);

    expect(await readFile(rulesPath, "utf8")).toBe("");
  });

  test("dry-run remove preserves Fulcrum rules block", async () => {
    await mkdir(join(tmp, ".codex"), { recursive: true });
    await applyRulesAction("install", false);
    const rulesPath = join(tmp, ".codex", "AGENTS.md");
    const before = await readFile(rulesPath, "utf8");

    await applyRulesAction("remove", true);

    expect(await readFile(rulesPath, "utf8")).toBe(before);

    await applyRulesAction("remove", false);

    expect(await readFile(rulesPath, "utf8")).toBe("");
  });
});
