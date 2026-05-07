import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-doc-template-cli-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function runFulcrum(args: readonly string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bun", "run", "apps/cli/src/main.ts", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FULCRUM_HOME: scratch,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

describe("fulcrum docs template CLI", () => {
  test("fulcrum docs template list --json emits all seeded templates", async () => {
    const init = await runFulcrum(["init"]);
    expect(init.exitCode).toBe(0);

    const result = await runFulcrum(["docs", "template", "list", "--json"]);
    expect(result.exitCode).toBe(0);

    const rows = JSON.parse(result.stdout) as Array<{
      docType: string;
      projectId: string | null;
      bodyTemplate: string;
      frontmatterTemplate: Record<string, unknown>;
      isDefault: boolean;
    }>;
    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.projectId === null)).toBe(true);
    expect(rows.every((row) => row.isDefault)).toBe(true);
    expect(rows.every((row) => typeof row.bodyTemplate === "string")).toBe(true);
    expect(rows.every((row) => typeof row.frontmatterTemplate === "object")).toBe(true);
  });
});
