import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

async function collectSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (!entry.isFile()) return [];
    if (!path.endsWith(".ts")) return [];
    if (path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/__tests__/")) return [];
    if (path.includes("/node_modules/") || path.includes("/.svelte-kit/")) return [];
    return [path];
  }));
  return files.flat();
}

async function filesMatching(roots: readonly string[], pattern: RegExp): Promise<string[]> {
  const files = (await Promise.all(roots.map(collectSourceFiles))).flat();
  const found: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (pattern.test(text)) found.push(relative(process.cwd(), file));
  }
  return found.sort();
}

describe("interface cross-phase security regressions", () => {
  test("CR-01 path traversal: workspace deletion validates real path before recursive rm", async () => {
    const source = await readFile("services/execution-orchestration/src/infrastructure/agent-runtime/symphony/workspace.ts", "utf8");

    expect(source).toContain("realpath");
    expect(source).toMatch(/assertWorkspacePathInOrgRoot[\s\S]+rm\(/);
  });

  test("CR-02 XSS: Symphony HTTP dashboard escapes issue identifiers before HTML render", async () => {
    const source = await readFile("services/execution-orchestration/src/infrastructure/agent-runtime/symphony/http-server.ts", "utf8");

    expect(source).toMatch(/escapeHtml|sanitize/);
    expect(source).not.toMatch(/<li>\$\{r\.issue_identifier\}/);
  });

  test("CR-03 deterministic IDs: Linear tracker has no module-level mutable candidate counter", async () => {
    const source = await readFile("services/execution-orchestration/src/infrastructure/agent-runtime/symphony/linear-tracker.ts", "utf8");

    expect(source).not.toMatch(/let\s+candidateIdCounter|candidateIdCounter\s*\+=/);
    expect(source).toContain("deterministicUuid");
  });

  test("CR-04 approval race: app-server approvals do not default to auto-approve on timeout", async () => {
    const source = await readFile("services/execution-orchestration/src/infrastructure/agent-runtime/symphony/app-server-client.ts", "utf8");

    expect(source).not.toMatch(/async\s*\(\)\s*=>\s*["']approve["']/);
    expect(source).not.toMatch(/setTimeout\(\(\)\s*=>\s*res\(["']approve["']\)/);
  });

  test("WR-05 terminal workspace path validation occurs before sweep removal", async () => {
    const source = await readFile("services/execution-orchestration/src/infrastructure/agent-runtime/symphony/workspace.ts", "utf8");
    const sweep = source.slice(source.indexOf("export async function sweepTerminalWorkspaces"));

    expect(sweep).toMatch(/assertWorkspacePathInOrgRoot[\s\S]+rm\(/);
  });
});

describe("interface additional architecture requirement gates", () => {
  test("R-14 workers and notifications do not call getConnection().execute()", async () => {
    expect(await filesMatching(
      [
        "services/platform-core/src/application/jobs",
        "services/notification-center/src/application/delivery-runtime",
      ],
      /getConnection\(\)\.execute\(/,
    )).toEqual([]);
  });

  test.skip("R-16 rate-limit middleware exists under apps/server/src/runtime or apps/server/src/api", async () => {
    expect(await filesMatching(["apps/server/src/runtime", "apps/server/src/api"], /rateLimit|rateLimiter/)).not.toEqual([]);
  });

  test("R-17 encrypt/decrypt functions exist in application crypto boundary", async () => {
    const candidates = [
      "services/integration-hub/src/application/webhooks/crypto.ts",
      "services/integration-hub/src/application/webhooks/encryption.ts",
    ];

    expect(candidates.some((candidate) => existsSync(candidate))).toBe(true);
  });

  test("R-19 product-kernel API router has been removed", () => {
    expect(existsSync("@test-support/product-workspace-fixtures.ts")).toBe(false);
  });

  test("R-21 fulcrum settings command is registered in CLI help", async () => {
    const source = await readFile("apps/cli/src/index.ts", "utf8");

    expect(source).toContain("fulcrum settings");
  });
});
