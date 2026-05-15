
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

let TMP: string;
let SLUG: string;
let SHA_FILE: string;
const FULCRUM_REPO = resolve(import.meta.dir, "../..");

async function gitInit() {
  // Initialize a fresh repo, commit one file, return HEAD sha.
  const sh = (args: string[]) => Bun.spawn(args, { cwd: TMP, stdout: "pipe", stderr: "pipe" });
  await sh(["git", "init", "-q", "-b", "main"]).exited;
  await sh(["git", "config", "user.email", "test@example.com"]).exited;
  await sh(["git", "config", "user.name", "Test"]).exited;
  await writeFile(join(TMP, "first.txt"), "hello\n");
  await sh(["git", "add", "first.txt"]).exited;
  await sh(["git", "commit", "-q", "-m", "first"]).exited;
  const head = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: TMP, stdout: "pipe" });
  const sha = (await new Response(head.stdout).text()).trim();
  await head.exited;
  return sha;
}

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-idx-rebuild-"));
  SLUG = basename(TMP);
  SHA_FILE = join(tmpdir(), `${SLUG}.index-sha`);
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
  try { await rm(SHA_FILE, { force: true }); } catch {}
});

async function runIdxRebuild(): Promise<{ stdout: string; exit: number; stderr: string }> {
  const stdinFile = `${TMP}/stdin-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(stdinFile, "{}");
  const proc = Bun.spawn(["bun", join(FULCRUM_REPO, "apps/cli/src/main.ts"), "hook", "index-rebuild"], {
    stdin: Bun.file(stdinFile),
    stdout: "pipe",
    stderr: "pipe",
    cwd: TMP,
    env: { ...process.env, CLAUDE_PROJECT_DIR: TMP, HOME: TMP },
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout, exit, stderr };
}

describe("index-rebuild", () => {
  test("no-op fast-path: SHA file matches HEAD and tree is clean → exit 0 quickly", async () => {
    const sha = await gitInit();
    await Bun.write(SHA_FILE, sha);
    const r = await runIdxRebuild();
    expect(r.exit).toBe(0);
  });

  test("dirty tree → exit 0 (tools may or may not be installed; allSettled never throws)", async () => {
    await writeFile(join(TMP, "dirty.txt"), "x\n");
    const r = await runIdxRebuild();
    expect(r.exit).toBe(0);
  });
});
