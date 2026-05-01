import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
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
    ["bun", "build", "--compile", "src/index.ts", "--outfile", BINARY],
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
});
