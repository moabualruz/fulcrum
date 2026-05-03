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
  name: string;
  slug: string;
  kind: "local" | "remote";
  syncStatus: "idle" | "syncing" | "error";
  lastSyncAt: string | null;
  currentBranch: string | null;
  remoteUrl: string | null;
  localPath: string | null;
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
  { id: "11111111-1111-4111-8111-111111111111", name: "Fulcrum", slug: "fulcrum", kind: "local", syncStatus: "idle", lastSyncAt: "2026-05-03T10:00:00.000Z", currentBranch: "main", remoteUrl: null, localPath: "/workspace/fulcrum" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Remote UI", slug: "remote-ui", kind: "remote", syncStatus: "syncing", lastSyncAt: null, currentBranch: "main", remoteUrl: "https://example.test/ui.git", localPath: null },
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

  test("renders repo rows with kind and sync badges", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: { repos: REPOS } } } },
    });
    expect(body.match(/data-repo-row/g) ?? []).toHaveLength(2);
    expect(body).toContain("Fulcrum");
    expect(body).toContain("data-repo-kind");
    expect(body).toContain("data-sync-status");
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
