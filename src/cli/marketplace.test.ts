import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { resetRegistry, seedRegistry } from "../marketplace/registry.ts";
import type { MarketplaceListing } from "../marketplace/types.ts";

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    slug: "test-skill",
    version: "1.0.0",
    publisher: "alice",
    description: "A test skill",
    tags: ["test"],
    stars: 0,
    signature: "c2lnOmFiYzEyMw==",
    contentHash: "abc123",
    ...overrides,
  };
}

describe("CLI marketplace", () => {
  let origFeatures: string | undefined;
  let logSpy: ReturnType<typeof spyOn>;
  let errSpy: ReturnType<typeof spyOn>;
  let exitSpy: ReturnType<typeof spyOn>;
  const logs: string[] = [];
  const errs: string[] = [];
  let exitCode: number | undefined;

  beforeEach(() => {
    origFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "skill-marketplace";
    resetRegistry();
    logs.length = 0;
    errs.length = 0;
    exitCode = undefined;

    logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    errSpy = spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errs.push(String(a[0]));
    });
    exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${code}`);
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    if (origFeatures !== undefined) process.env["FULCRUM_FEATURES"] = origFeatures;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("browse --json outputs JSON array", async () => {
    seedRegistry([makeListing({ slug: "a" }), makeListing({ slug: "b" })]);
    const { run } = await import("./marketplace.ts");
    await run(["browse", "--json"]);
    const parsed = JSON.parse(logs[0]!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  test("browse with --query filters results", async () => {
    seedRegistry([
      makeListing({ slug: "jq-skill" }),
      makeListing({ slug: "bat-skill" }),
    ]);
    const { run } = await import("./marketplace.ts");
    await run(["browse", "--query", "jq", "--json"]);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].slug).toBe("jq-skill");
  });

  test("install with bad sig exits 1", async () => {
    seedRegistry([makeListing({ slug: "bad", signature: "" })]);
    const { run } = await import("./marketplace.ts");
    try {
      await run(["install", "--slug", "bad"]);
    } catch {
      // EXIT_1 thrown by mock
    }
    expect(exitCode).toBe(1);
    expect(errs.some((e) => e.includes("Signature verification failed"))).toBe(true);
  });

  test("feature disabled exits 1", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const { run } = await import("./marketplace.ts");
    try {
      await run(["browse"]);
    } catch {
      // EXIT_1
    }
    expect(exitCode).toBe(1);
    expect(errs.some((e) => e.includes("skill-marketplace"))).toBe(true);
  });

  test("fetch --json outputs listing", async () => {
    seedRegistry([makeListing({ slug: "my-skill" })]);
    const { run } = await import("./marketplace.ts");
    await run(["fetch", "--slug", "my-skill", "--json"]);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.slug).toBe("my-skill");
  });
});
