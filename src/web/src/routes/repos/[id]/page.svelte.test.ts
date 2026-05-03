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
  name: string;
  slug: string;
  kind: "local" | "remote";
  currentBranch: string | null;
  syncStatus: "idle" | "syncing" | "error";
  lastSyncAt: string | null;
  syncError: string | null;
};

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data:
        | Promise<{
            repo: RepoDetail;
            commits: Array<{ sha: string; subject: string; author: string | null; committedAt: string | null }>;
            openTaskCount: number;
            recentRunCount: number;
          }>
        | {
            repo: RepoDetail;
            commits: Array<{ sha: string; subject: string; author: string | null; committedAt: string | null }>;
            openTaskCount: number;
            recentRunCount: number;
          };
    };
  };
};

const PAYLOAD = {
  repo: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Fulcrum",
    slug: "fulcrum",
    kind: "local" as const,
    currentBranch: "feature/repos",
    syncStatus: "error" as const,
    lastSyncAt: "2026-05-03T10:00:00.000Z",
    syncError: "git fetch failed",
  },
  commits: [
    { sha: "abcdef1", subject: "feat: repo dashboard", author: "M", committedAt: "2026-05-03T10:00:00.000Z" },
  ],
  openTaskCount: 3,
  recentRunCount: 2,
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
    expect(body).toContain("Fulcrum");
    expect(body).toContain("feature/repos");
    expect(body).toContain("data-current-branch");
    expect(body).toContain("data-sync-status");
    expect(body).toContain("data-sync-error");
    expect(body).toContain("data-sync-now");
  });

  test("renders commits and dashboard count panels", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: PAYLOAD } } },
    });
    expect(body).toContain("data-recent-commits");
    expect(body).toContain("abcdef1");
    expect(body).toContain("feat: repo dashboard");
    expect(body).toContain("data-open-task-count");
    expect(body).toContain('href="/tasks?repo=11111111-1111-4111-8111-111111111111"');
    expect(body).toContain("data-recent-run-count");
  });
});
