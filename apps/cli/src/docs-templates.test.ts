import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { run } from "./docs-templates.ts";

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
  test("direct docs template command uses the configured public API", async () => {
    const lines: string[] = [];
    const calls: string[] = [];
    await run(["list", "--json"], {
      print: (line) => lines.push(line),
      env: {
        FULCRUM_SERVER_URL: "http://127.0.0.1:3210",
        FULCRUM_ORG_ID: "org-1",
      },
      fetch: (async (url: string | URL | Request) => {
        calls.push(String(url));
        return Response.json([{ id: "tpl-1", docType: "adr", name: "ADR" }]);
      }) as unknown as typeof globalThis.fetch,
    });

    expect(JSON.parse(lines[0] as string)).toEqual([{ id: "tpl-1", docType: "adr", name: "ADR" }]);
    expect(calls).toEqual(["http://127.0.0.1:3210/api/v1/docs/templates"]);
  });

  test("main docs template path requires the configured document public API", async () => {
    const result = await runFulcrum(["docs", "template", "list", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Document API caller is not configured");
  });
});
