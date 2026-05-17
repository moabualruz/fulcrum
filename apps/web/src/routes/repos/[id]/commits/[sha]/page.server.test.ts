import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let commitDetail: unknown;
const repoPagesMock = ((globalThis as typeof globalThis & {
  __repoPagesMock?: Record<string, unknown>;
}).__repoPagesMock ??= {});

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-repo-commit-diff-"));
  process.env["FULCRUM_HOME"] = scratch;
  commitDetail = null;
  repoPagesMock["commitDetail"] = commitDetail;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedCommitDiff(): Promise<{ repoId: string; sha: string }> {
  const repoId = makeId();
  const sha = "abcdef1234567890abcdef1234567890abcdef12";
  const raw = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1,2 @@\n-old\n+new\n+line\n";
  commitDetail = {
    repo: { id: repoId, name: "Fulcrum", slug: "fulcrum" },
    commit: { sha, subject: "feat: diff view", author: "M <m@example.test>", committedAt: "2026-05-03T10:00:00.000Z" },
    diff: {
      raw,
      html: `<div data-diff2html><div data-shiki-line>src/a.ts</div></div>`,
      filesChanged: 1,
      insertions: 2,
      deletions: 1,
    },
  };
  repoPagesMock["commitDetail"] = commitDetail;
  return { repoId, sha };
}

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
  loadRepositoryCommitsPage: async () => ({ repo: null, commits: [], page: 1, totalPages: 1, total: 0 }),
  loadRepositoryCommitDetail: async () => repoPagesMock["commitDetail"] ?? commitDetail,
}));

describe("/repos/[id]/commits/[sha] +page.server.ts", () => {
  test("load returns commit diff, rendered diff html, and stat summary", async () => {
    const { repoId, sha } = await seedCommitDiff();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const payload = await streamedData<{
      commit: { sha: string; subject: string };
      diff: { raw: string; html: string; filesChanged: number; insertions: number; deletions: number };
    }>(await mod.load({
      params: { id: repoId, sha },
      url: new URL(`http://localhost/repos/${repoId}/commits/${sha}?view=split`),
      locals: {},
    } as Parameters<typeof mod.load>[0]));
    expect(payload.commit.subject).toBe("feat: diff view");
    expect(payload.diff.filesChanged).toBe(1);
    expect(payload.diff.insertions).toBe(2);
    expect(payload.diff.deletions).toBe(1);
    expect(payload.diff.html).toContain("data-diff2html");
    expect(payload.diff.html).toContain("src/a.ts");
    expect(payload.diff.html).toContain("data-shiki-line");
  });
});
