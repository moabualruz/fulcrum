import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fulcrumHome: string | null = null;
let originalFulcrumHome: string | undefined;
let originalDatabaseUrl: string | undefined;

beforeEach(async () => {
  fulcrumHome = await mkdtemp(join(tmpdir(), "fulcrum-cli-init-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalDatabaseUrl = process.env["DATABASE_URL"];
  process.env["FULCRUM_HOME"] = fulcrumHome;
  delete process.env["DATABASE_URL"];
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;

  if (originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = originalDatabaseUrl;

  await rm(fulcrumHome!, { recursive: true, force: true });
  fulcrumHome = null;
});

describe("cli init command", () => {
  test("prints bootstrapped on first run and already initialized after org exists", async () => {
    const { run } = await import("./init.ts");
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((message: unknown) => {
      logs.push(String(message));
    });

    try {
      await run();
      await run();
    } finally {
      logSpy.mockRestore();
    }

    expect(logs).toContain("✓ Local org bootstrapped");
    expect(logs).toContain("✓ Already initialized");
  });
});
