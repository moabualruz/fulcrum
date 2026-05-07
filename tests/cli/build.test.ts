import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const BINARY = join(process.cwd(), "dist", "fulcrum");
const MAX_BINARY_BYTES = 150 * 1024 * 1024;

async function buildBinary(): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  await mkdir(dirname(BINARY), { recursive: true });
  await rm(BINARY, { force: true });

  const proc = Bun.spawn(
    ["bun", "build", "--compile", "apps/cli/src/main.ts", "--outfile", BINARY],
    {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

describe("fulcrum binary build", () => {
  test("scripts/build-cli.ts creates dist/fulcrum with size gate", async () => {
    await rm(BINARY, { force: true });

    const proc = Bun.spawn(["bun", "run", "scripts/build-cli.ts"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    expect(await Bun.file(BINARY).exists()).toBe(true);
    expect(stdout).toContain("dist/fulcrum");
    expect(stdout).toContain("binary size");
  });

  test("bun build --compile creates dist/fulcrum", async () => {
    const result = await buildBinary();

    expect(result.exitCode, result.stderr).toBe(0);
    expect(await Bun.file(BINARY).exists()).toBe(true);

    const stat = await Bun.file(BINARY).stat();
    if (stat.size > MAX_BINARY_BYTES) {
      console.warn(
        `fulcrum binary ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds 150MB warning threshold`,
      );
    }
  });

  test("compiled binary can report DB status with default PGlite backend", async () => {
    const result = await buildBinary();
    expect(result.exitCode, result.stderr).toBe(0);

    const home = await mkdtemp(join(tmpdir(), "fulcrum-compiled-db-"));
    try {
      const proc = Bun.spawn([BINARY, "db", "status", "--json"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FULCRUM_HOME: home,
          DATABASE_URL: "",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(`${stdout}\n${stderr}`).not.toContain("/$bunfs/root/pglite.data");
      expect(`${stdout}\n${stderr}`).not.toContain("Compiled Bun binary cannot use PGlite");
      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(() => JSON.parse(stdout)).not.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
