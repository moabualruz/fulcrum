import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: { url: new URL("http://localhost/repos/repo-1"), params: { id: "repo-1" }, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null },
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

type RepoDetail = {
  id: string;
  slug: string;
  branch: string | null;
  dirty: boolean;
  health: "healthy" | "stale" | "failed";
  lastSyncAt: string | null;
  lastSyncError: string | null;
  path: string;
};

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data:
        | Promise<{
            repo: RepoDetail;
            branches: Array<{ name: string; isCurrent?: boolean; sha?: string | null }>;
            commits: Array<{ sha: string; message?: string | null; author?: string | null; committedAt: string }>;
            files: Array<{ path: string; kind: string; size?: number | null }>;
            syncLog: Array<{ status: string; message?: string | null; createdAt: string }>;
          }>
        | {
            repo: RepoDetail;
            branches: Array<{ name: string; isCurrent?: boolean; sha?: string | null }>;
            commits: Array<{ sha: string; message?: string | null; author?: string | null; committedAt: string }>;
            files: Array<{ path: string; kind: string; size?: number | null }>;
            syncLog: Array<{ status: string; message?: string | null; createdAt: string }>;
          };
    };
  };
};

const PAYLOAD = {
  repo: {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "fulcrum",
    branch: "feature/repos",
    dirty: true,
    health: "failed" as const,
    lastSyncAt: "2026-05-03T10:00:00.000Z",
    lastSyncError: "git fetch failed",
    path: "/workspace/fulcrum",
  },
  branches: [{ name: "feature/repos", isCurrent: true, sha: "abcdef1" }],
  commits: [
    { sha: "abcdef1", message: "feat: repo dashboard", author: "M", committedAt: "2026-05-03T10:00:00.000Z" },
  ],
  files: [{ path: "src/index.ts", kind: "file", size: 123 }],
  syncLog: [{ status: "failed", message: "git fetch failed", createdAt: "2026-05-03T10:00:00.000Z" }],
};

describe("/repos/[id] +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders detail skeleton while pending", () => {
    const pending = new Promise<typeof PAYLOAD>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="detail"');
  });

  test("renders repo header, branch chip, sync status, and sync button", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: PAYLOAD } } },
    });
    expect(body).toContain("data-repo-detail-header");
    expect(body).toContain("fulcrum");
    expect(body).toContain("feature/repos");
    expect(body).toContain("data-current-branch");
    expect(body).toContain("data-repo-health");
    expect(body).toContain("data-sync-error");
    expect(body).toContain("data-sync-now");
  });

  test("renders branch, commit, file, and sync-log slices without mismatched empty states", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: PAYLOAD } } },
    });
    expect(body).toContain("data-repo-branches");
    expect(body).toContain("feature/repos");
    expect(body).toContain("data-recent-commits");
    expect(body).toContain("abcdef1");
    expect(body).toContain("feat: repo dashboard");
    expect(body).toContain("data-repo-files");
    expect(body).toContain("src/index.ts");
    expect(body).toContain("data-sync-log");
    expect(body).toContain("git fetch failed");
    expect(body).not.toContain("No branches found.");
    expect(body).not.toContain("No commits found.");
  });
});
