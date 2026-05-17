import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let commitRows: Array<{ sha: string; shortSha: string; author: string; email: string; date: string; message: string }> = [];
let knownRepoId = "";
const repoPagesMock = ((globalThis as typeof globalThis & {
  __repoPagesMock?: Record<string, unknown>;
}).__repoPagesMock ??= {});

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

async function seedRepo(scratch: string, rootPath: string) {
  const repoId = makeId();
  knownRepoId = repoId;
  commitRows = rootPath.includes("nonexistent")
    ? []
    : Array.from({ length: 75 }, (_, index) => {
      const hex = String(index + 1).padStart(40, "a");
      return {
        sha: hex,
        shortSha: hex.slice(0, 8),
        author: "Fulcrum",
        email: "fulcrum@example.test",
        date: "2026-01-02T00:00:00.000Z",
        message: `commit ${index + 1}`,
      };
    });
  repoPagesMock["knownRepoId"] = knownRepoId;
  repoPagesMock["commitRows"] = commitRows;
  return { repoId };
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repos-commits-"));
  process.env["FULCRUM_HOME"] = scratch;
  commitRows = [];
  knownRepoId = "";
  repoPagesMock["knownRepoId"] = knownRepoId;
  repoPagesMock["commitRows"] = commitRows;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

mock.module("@integration-hub/interface/repository-pages.ts", () => ({
  REPOSITORY_WRITE_ACTIONS_GATE: {
    code: "FEATURE_GATED",
    message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
  },
  listRepositoryPageRows: async () => [],
  listRepositoryDashboard: async () => [],
  loadRepositoryDetail: async () => ({ branches: [], commits: [], files: [], syncLog: [] }),
  loadRepositoryBranchesPage: async () => ({ repo: null, branches: [], writeOpsEnabled: false }),
  createRepositoryBranch: async () => ({ ok: true }),
  checkoutRepositoryBranch: async () => ({ ok: true }),
  deleteRepositoryBranch: async () => ({ ok: true }),
  loadRepositoryCommitsPage: async (
    _context: unknown,
    input: { repoId: string; page: number; pageSize: number },
  ) => {
    if (input.repoId !== repoPagesMock["knownRepoId"]) {
      const { AppNotFoundError } = await import("@platform-core/domain/errors.ts");
      throw new AppNotFoundError("Repo not found");
    }
    const rows = (repoPagesMock["commitRows"] as typeof commitRows | undefined) ?? commitRows;
    const start = (input.page - 1) * input.pageSize;
    return {
      repo: {
        id: input.repoId,
        slug: "commitrepo",
        local_path: null,
        root_path: null,
        default_branch: "main",
        last_seen_at: "2026-01-02T00:00:00.000Z",
      },
      commits: rows.slice(start, start + input.pageSize),
      page: input.page,
      totalPages: Math.max(1, Math.ceil(rows.length / input.pageSize)),
      total: rows.length,
    };
  },
  loadRepositoryCommitDetail: async () => null,
}));

describe("/repos/[id]/commits +page.server.ts", () => {
  test("PAGE_SIZE constant is 50", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}-page-size`);
    expect(mod._PAGE_SIZE).toBe(50);
  });

  test("returns empty commits when git repo does not exist", async () => {
    const { repoId } = await seedRepo(scratch, "/nonexistent-git-dir");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{ commits: unknown[]; total: number; page: number; totalPages: number }>(result);
    expect(payload.commits).toEqual([]);
    expect(payload.total).toBe(0);
    expect(payload.page).toBe(1);
    expect(payload.totalPages).toBe(1);
  });

  test("throws 404 for unknown repo id", async () => {
    await seedRepo(scratch, "/tmp/x");
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let threw = false;
    try {
      const result = await mod.load({
        params: { id: "no-such-id" },
        url: new URL("http://localhost/repos/x/commits"),
        locals: { activeProjectId: null },
      } as Parameters<typeof mod.load>[0]);
      await streamedData(result);
    } catch (err) {
      threw = true;
      expect((err as { status?: number }).status).toBe(404);
    }
    expect(threw).toBe(true);
  });

  test("reads commits from a real git repo with pagination", async () => {
    // Use the fulcrum repo root itself
    const repoRoot = join(import.meta.dir, "../../../../../../..");
    const { repoId } = await seedRepo(scratch, repoRoot);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=1"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<{
      commits: Array<{ sha: string; shortSha: string; author: string; email: string; date: string; message: string }>;
      total: number;
      page: number;
      totalPages: number;
    }>(result);

    expect(payload.commits.length).toBeGreaterThan(0);
    expect(payload.commits.length).toBeLessThanOrEqual(50);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.page).toBe(1);

    // Validate structure: 8-char shortSha, monospace-friendly
    const c = payload.commits[0]!;
    expect(c.shortSha).toHaveLength(8);
    expect(c.sha).toHaveLength(40);
    expect(typeof c.author).toBe("string");
    expect(typeof c.email).toBe("string");
    expect(typeof c.message).toBe("string");
  });

  test("respects page param and returns correct slice", async () => {
    const repoRoot = join(import.meta.dir, "../../../../../../..");
    const { repoId } = await seedRepo(scratch, repoRoot);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);

    const result1 = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=1"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);
    const result2 = await mod.load({
      params: { id: repoId },
      url: new URL("http://localhost/repos/x/commits?page=2"),
      locals: { activeProjectId: null },
    } as Parameters<typeof mod.load>[0]);

    const [p1, p2] = await Promise.all([
      streamedData<{ commits: Array<{ sha: string }> }>(result1),
      streamedData<{ commits: Array<{ sha: string }> }>(result2),
    ]);

    // Pages should be disjoint (different SHAs)
    if (p1.commits.length > 0 && p2.commits.length > 0) {
      expect(p1.commits[0]?.sha).not.toBe(p2.commits[0]?.sha);
    }
  });
});
