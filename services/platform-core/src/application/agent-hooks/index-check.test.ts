
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, utimes, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

let TMP: string;
const FULCRUM_REPO = process.cwd();

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-idx-check-"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function reset() {
  for (const p of ["tags"]) {
    const full = join(TMP, p);
    if (existsSync(full)) {
      try { await rm(full, { recursive: true, force: true }); } catch {}
      try { await unlink(full); } catch {}
    }
  }
}

async function runIdxCheck(): Promise<{ stdout: string; exit: number; stderr: string }> {
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, "{}");
  const proc = Bun.spawn(["bun", join(FULCRUM_REPO, "apps/cli/src/main.ts"), "hook", "index-check"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    cwd: TMP,
    env: { ...process.env, HOME: TMP, CLAUDE_PROJECT_DIR: TMP },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("index-check", () => {
  test("no tags file in cwd → stdout contains 'No ctags index'", async () => {
    await reset();
    const r = await runIdxCheck();
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("No ctags index");
  });

  test("fresh tags file → stdout stays quiet", async () => {
    await reset();
    await writeFile(join(TMP, "tags"), "");
    const r = await runIdxCheck();
    expect(r.exit).toBe(0);
    expect(r.stdout).not.toContain("ctags index is");
    expect(r.stdout).not.toContain("No ctags index");
    expect(r.stdout.trim()).toBe("");
  });

  test("stale tags file (mtime 2h old) → stdout contains 'ctags index is' and 'min old'", async () => {
    await reset();
    const tagsPath = join(TMP, "tags");
    await writeFile(tagsPath, "");
    const old = new Date(Date.now() - 2 * 3600 * 1000);
    await utimes(tagsPath, old, old);
    const r = await runIdxCheck();
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("ctags index is");
    expect(r.stdout).toContain("min old");
  });
});
