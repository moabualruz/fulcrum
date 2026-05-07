import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

interface Props {
  count: number;
}

describe("BellBadge", () => {
  let render: typeof import("svelte/server").render;
  let BellBadge: Component<Props>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./BellBadge.svelte")) as { default: Component<Props> };
    BellBadge = mod.default;
  });

  test("renders bell icon with data-bell-badge", () => {
    const { body } = render(BellBadge, { props: { count: 0 } });
    expect(body).toContain("data-bell-badge");
  });

  test("shows count badge when count > 0", () => {
    const { body } = render(BellBadge, { props: { count: 7 } });
    expect(body).toContain("data-bell-count");
    expect(body).toContain("7");
  });

  test("hides count badge when count is 0", () => {
    const { body } = render(BellBadge, { props: { count: 0 } });
    expect(body).not.toContain("data-bell-count");
  });
});
