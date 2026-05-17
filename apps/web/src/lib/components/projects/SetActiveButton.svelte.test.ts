import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules; the
// global `[test] preload` plugin (`svelte-ssr-preload.ts`) wires this up.

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

type SetActiveButtonProps = { slug: string; active?: boolean };

describe("SetActiveButton component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let SetActiveButton: Component<SetActiveButtonProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./SetActiveButton.svelte")) as {
      default: Component<SetActiveButtonProps>;
    };
    SetActiveButton = mod.default;
  });

  test("default render: data-set-active-project + slug + aria-pressed=false + 'Set active' label", () => {
    const { body } = render(SetActiveButton, { props: { slug: "fulcrum" } });
    expect(body).toContain("data-set-active-project");
    expect(body).toContain('data-slug="fulcrum"');
    expect(body).toContain('aria-pressed="false"');
    expect(body).toMatch(/<button\b[^>]*data-set-active-project[^>]*>[\s\S]*?Set active[\s\S]*?<\/button>/);
  });

  test("active=true: aria-pressed=true and label 'Active project'", () => {
    const { body } = render(SetActiveButton, {
      props: { slug: "fulcrum", active: true },
    });
    expect(body).toContain('aria-pressed="true"');
    expect(body).toMatch(/<button\b[^>]*data-set-active-project[^>]*>[\s\S]*?Active project[\s\S]*?<\/button>/);
  });
});
