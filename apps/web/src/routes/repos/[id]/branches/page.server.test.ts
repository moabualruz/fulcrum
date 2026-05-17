import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let branchPage: {
  repo: { id: string; name: string; slug: string; currentBranch: string | null };
  writeOpsEnabled: boolean;
  gate: { code: "FEATURE_GATED"; message: string };
  branches: Array<{ name: string; headSha: string | null; isCurrent: boolean; isDefault: boolean }>;
};
const repoPagesMock = ((globalThis as typeof globalThis & {
  __repoPagesMock?: Record<string, unknown>;
}).__repoPagesMock ??= {});

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-branches-"));
  process.env["FULCRUM_HOME"] = scratch;
  branchPage = branchFixture(makeId(), false);
  repoPagesMock["branchPage"] = branchPage;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedBranches(writeOps = false): Promise<string> {
  const repoId = makeId();
  branchPage = branchFixture(repoId, writeOps);
  repoPagesMock["branchPage"] = branchPage;
  return repoId;
}

function branchFixture(repoId: string, writeOpsEnabled: boolean): typeof branchPage {
  return {
    repo: { id: repoId, name: "Fulcrum", slug: "fulcrum", currentBranch: "feature/repos" },
    writeOpsEnabled,
    gate: {
      code: "FEATURE_GATED",
      message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
    },
    branches: [
      { name: "feature/repos", headSha: "abcdef1234567890", isCurrent: true, isDefault: false },
      { name: "main", headSha: "1234567890abcdef", isCurrent: false, isDefault: true },
    ],
  };
}

mock.module("@integration-hub/interface/repository-pages.ts", () => ({
  REPOSITORY_WRITE_ACTIONS_GATE: {
    code: "FEATURE_GATED",
    message: "Write operations disabled. Enable repo-write-ops to create, checkout, or delete branches.",
  },
  listRepositoryPageRows: async () => [],
  listRepositoryDashboard: async () => [],
  loadRepositoryDetail: async () => ({ branches: [], commits: [], files: [], syncLog: [] }),
  loadRepositoryBranchesPage: async () => repoPagesMock["branchPage"] ?? branchPage,
  createRepositoryBranch: async () => {
    const page = (repoPagesMock["branchPage"] as typeof branchPage | undefined) ?? branchPage;
    if (!page.writeOpsEnabled) {
      const { AppForbiddenError } = await import("@platform-core/domain/errors.ts");
      throw new AppForbiddenError("Write operations disabled.");
    }
    return { ok: true };
  },
  checkoutRepositoryBranch: async (_context: unknown, input: { name: string }) => {
    const page = (repoPagesMock["branchPage"] as typeof branchPage | undefined) ?? branchPage;
    if (!page.writeOpsEnabled) {
      const { AppForbiddenError } = await import("@platform-core/domain/errors.ts");
      throw new AppForbiddenError("Write operations disabled.");
    }
    page.repo.currentBranch = input.name;
    page.branches = page.branches.map((branch) => ({
      ...branch,
      isCurrent: branch.name === input.name,
    }));
    return { ok: true };
  },
  deleteRepositoryBranch: async () => ({ ok: true }),
  loadRepositoryCommitsPage: async () => ({ repo: null, commits: [], page: 1, totalPages: 1, total: 0 }),
  loadRepositoryCommitDetail: async () => ({ repo: null, commit: null, diff: null }),
}));

describe("/repos/[id]/branches +page.server.ts", () => {
  test("load lists branches and reports write gate disabled by default", async () => {
    const repoId = await seedBranches(false);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const payload = await streamedData<{
      repo: { id: string; currentBranch: string | null };
      writeOpsEnabled: boolean;
      branches: Array<{ name: string; headSha: string | null; isCurrent: boolean; isDefault: boolean }>;
    }>(await mod.load({ params: { id: repoId }, locals: {} } as Parameters<typeof mod.load>[0]));
    expect(payload.writeOpsEnabled).toBe(false);
    expect(payload.repo.currentBranch).toBe("feature/repos");
    expect(payload.branches).toEqual([
      { name: "feature/repos", headSha: "abcdef1234567890", isCurrent: true, isDefault: false },
      { name: "main", headSha: "1234567890abcdef", isCurrent: false, isDefault: true },
    ]);
  });

  test("new branch action is feature gated", async () => {
    const repoId = await seedBranches(false);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("name", "new/topic");
    const result = await mod.actions.create({
      params: { id: repoId },
      request: new Request(`http://localhost/repos/${repoId}/branches`, { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.create>[0]);
    expect(result.status).toBe(403);
    expect(result.data.code).toBe("FEATURE_GATED");
  });

  test("checkout action updates current branch when write ops enabled", async () => {
    const repoId = await seedBranches(true);
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("name", "main");
    expect(await mod.actions.checkout({
      params: { id: repoId },
      request: new Request(`http://localhost/repos/${repoId}/branches`, { method: "POST", body: fd }),
    } as Parameters<typeof mod.actions.checkout>[0])).toEqual({ ok: true });
    const payload = await streamedData<{ repo: { currentBranch: string | null } }>(
      await mod.load({ params: { id: repoId }, locals: {} } as Parameters<typeof mod.load>[0]),
    );
    expect(payload.repo.currentBranch).toBe("main");
  });
});
