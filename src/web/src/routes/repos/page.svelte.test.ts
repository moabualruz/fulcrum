import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: { url: new URL("http://localhost/repos"), params: {}, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null },
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

type RepoListItem = {
  id: string;
  slug: string;
  branch: string | null;
  dirty: boolean;
  lastSyncAt: string | null;
  recentCommit: string | null;
  openTaskCount: number;
  health: "healthy" | "stale" | "failed";
  remoteUrl: string | null;
  path: string;
};

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data: Promise<{ repos: RepoListItem[] }> | { repos: RepoListItem[] };
    };
  };
};

const REPOS: RepoListItem[] = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "fulcrum", branch: "main", dirty: false, lastSyncAt: "2026-05-03T10:00:00.000Z", recentCommit: "abcdef1 feat: repos", openTaskCount: 3, health: "healthy", remoteUrl: null, path: "/workspace/fulcrum" },
  { id: "22222222-2222-4222-8222-222222222222", slug: "remote-ui", branch: "main", dirty: true, lastSyncAt: null, recentCommit: null, openTaskCount: 0, health: "stale", remoteUrl: "https://example.test/ui.git", path: "/workspace/ui" },
];

describe("/repos +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders list skeleton while data is pending", () => {
    const pending = new Promise<{ repos: RepoListItem[] }>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders repo rows with shared dashboard fields", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: { repos: REPOS } } } },
    });
    expect(body.match(/data-repo-row/g) ?? []).toHaveLength(2);
    expect(body).toContain("fulcrum");
    expect(body).toContain("data-current-branch");
    expect(body).toContain("data-dirty-state");
    expect(body).toContain("data-last-sync");
    expect(body).toContain("data-recent-commit");
    expect(body).toContain("data-open-task-count");
    expect(body).toContain("data-repo-health");
    expect(body).toContain('href="/repos/11111111-1111-4111-8111-111111111111"');
  });

  test("renders add repo modal form with path and remote URL variants", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: { repos: REPOS } } } },
    });
    expect(body).toContain("data-add-repo-trigger");
    expect(body).toContain("data-add-repo-form");
    expect(body).toContain('value="local"');
    expect(body).toContain('value="remote"');
    expect(body).toContain('name="path"');
    expect(body).toContain('name="url"');
    expect(body).toContain('name="name"');
    expect(body).toContain('name="projectId"');
  });
});
