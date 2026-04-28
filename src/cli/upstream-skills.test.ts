import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadUpstreamSkills, syncUpstreamSkills } from "./upstream-skills.ts";

let TMP: string;
let originalHome: string | undefined;
let originalRepoDir: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-upstream-"));
  originalHome = process.env["HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_REPO_DIR"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

async function writeLock(body: string): Promise<string> {
  const skillsDir = join(TMP, "skills");
  await mkdir(skillsDir, { recursive: true });
  const path = join(skillsDir, "upstream.lock");
  await writeFile(path, body);
  return path;
}

describe("upstream skill lock loading", () => {
  test("loads a valid lockfile entry from TOML", async () => {
    const lockPath = await writeLock([
      "[meta]",
      "schema_version = 1",
      "last_audit = \"2026-04-28\"",
      "",
      "[skills.example]",
      "source = \"https://github.com/example/repo\"",
      "subpath = \"skills/example\"",
      "ref = \"main\"",
      "tree_sha = \"0123456789abcdef0123456789abcdef01234567\"",
      "license = \"MIT\"",
      "author_class = \"individual\"",
      "pinned_on = \"2026-04-28\"",
      "review_due = \"2026-07-27\"",
      "",
    ].join("\n"));

    const skills = await loadUpstreamSkills(lockPath);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "example",
      source: "https://github.com/example/repo",
      subpath: "skills/example",
      ref: "main",
      tree_sha: "0123456789abcdef0123456789abcdef01234567",
      license: "MIT",
      author_class: "individual",
      pinned_on: "2026-04-28",
      review_due: "2026-07-27",
      kind: "dir",
    });
  });

  test("rejects incomplete metadata with exact field names", async () => {
    const lockPath = await writeLock([
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.example]",
      "source = \"https://github.com/example/repo\"",
      "subpath = \"skills/example\"",
      "ref = \"main\"",
      "license = \"MIT\"",
      "author_class = \"individual\"",
      "pinned_on = \"2026-04-28\"",
      "review_due = \"2026-07-27\"",
      "",
    ].join("\n"));

    await expect(loadUpstreamSkills(lockPath)).rejects.toThrow(/example: tree_sha is required/);
  });

  test("dry-run sync reads the lockfile count, not a baked-in list", async () => {
    const lockPath = await writeLock([
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.one]",
      "source = \"https://github.com/example/repo\"",
      "subpath = \"skills/one\"",
      "ref = \"main\"",
      "tree_sha = \"0123456789abcdef0123456789abcdef01234567\"",
      "license = \"MIT\"",
      "author_class = \"individual\"",
      "pinned_on = \"2026-04-28\"",
      "review_due = \"2026-07-27\"",
      "",
      "[skills.two]",
      "source = \"https://github.com/example/repo\"",
      "subpath = \"skills/two\"",
      "ref = \"main\"",
      "tree_sha = \"89abcdef0123456789abcdef0123456789abcdef\"",
      "license = \"MIT\"",
      "author_class = \"individual\"",
      "pinned_on = \"2026-04-28\"",
      "review_due = \"2026-07-27\"",
      "",
    ].join("\n"));

    await mkdir(join(TMP, ".codex", "skills"), { recursive: true });
    await mkdir(join(TMP, ".gemini"), { recursive: true });

    const spy = spyOn(console, "log").mockImplementation(() => {});
    let calls: Array<Array<unknown>> = [];
    try {
      await syncUpstreamSkills({ dryRun: true, lockPath });
      calls = spy.mock.calls.map((call) => [...call]);
    } finally {
      spy.mockRestore();
    }

    const firstLine = calls.map((call) => String(call[0])).find((line) => line.includes("curated skill(s)"));
    expect(firstLine).toContain("2 curated skill(s)");
  });
});
