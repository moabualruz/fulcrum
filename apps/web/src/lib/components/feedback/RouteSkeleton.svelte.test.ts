import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

interface RouteSkeletonProps {
  kind: "list" | "detail" | "board";
  rows?: number;
}

describe("RouteSkeleton.svelte", () => {
  let render: typeof import("svelte/server").render;
  let RouteSkeleton: Component<RouteSkeletonProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RouteSkeleton.svelte")) as {
      default: Component<RouteSkeletonProps>;
    };
    RouteSkeleton = mod.default;
  });

  test('kind="list" renders data-skeleton-list + default 6 data-skeleton-row', () => {
    const { body } = render(RouteSkeleton, { props: { kind: "list" } });
    expect(body).toContain("data-skeleton-list");
    const rowMatches = body.match(/data-skeleton-row/g) ?? [];
    expect(rowMatches).toHaveLength(6);
  });

  test('kind="list" rows=10 renders 10 data-skeleton-row', () => {
    const { body } = render(RouteSkeleton, { props: { kind: "list", rows: 10 } });
    expect(body).toContain("data-skeleton-list");
    const rowMatches = body.match(/data-skeleton-row/g) ?? [];
    expect(rowMatches).toHaveLength(10);
  });

  test('kind="detail" renders data-skeleton-title + exactly 3 data-skeleton-paragraph', () => {
    const { body } = render(RouteSkeleton, { props: { kind: "detail" } });
    expect(body).toContain("data-skeleton-detail");
    expect(body).toContain("data-skeleton-title");
    const paragraphMatches = body.match(/data-skeleton-paragraph/g) ?? [];
    expect(paragraphMatches).toHaveLength(3);
  });

  test('kind="board" renders 5 data-skeleton-column and 15 data-skeleton-card', () => {
    const { body } = render(RouteSkeleton, { props: { kind: "board" } });
    expect(body).toContain("data-skeleton-board");
    const columnMatches = body.match(/data-skeleton-column/g) ?? [];
    const cardMatches = body.match(/data-skeleton-card/g) ?? [];
    expect(columnMatches).toHaveLength(5);
    expect(cardMatches).toHaveLength(15);
  });

  test("always renders aria-busy=true, role=status, and sr-only Loading text", () => {
    const kinds: RouteSkeletonProps["kind"][] = ["list", "detail", "board"];
    for (const kind of kinds) {
      const { body } = render(RouteSkeleton, { props: { kind } });
      expect(body).toContain('aria-busy="true"');
      expect(body).toContain('role="status"');
      expect(body).toContain('class="sr-only"');
      expect(body).toContain("Loading");
    }
  });
});
