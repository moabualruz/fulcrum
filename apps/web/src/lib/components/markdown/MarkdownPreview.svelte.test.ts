import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

interface MarkdownPreviewProps {
  value?: string;
}

describe("MarkdownPreview component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let MarkdownPreview: Component<MarkdownPreviewProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./MarkdownPreview.svelte")) as {
      default: Component<MarkdownPreviewProps>;
    };
    MarkdownPreview = mod.default;
  });

  test("renders headings inside the prose wrapper", () => {
    const { body } = render(MarkdownPreview, { props: { value: "# Title" } });
    expect(body).toMatch(/<article\b[^>]*data-markdown-preview/);
    expect(body).toMatch(/<h1[^>]*>Title<\/h1>/);
  });

  test("strips <script> tags from the rendered body", () => {
    const { body } = render(MarkdownPreview, {
      props: { value: "<script>alert(1)</script>" },
    });
    expect(body.toLowerCase()).not.toContain("<script");
  });

  test("wrapper carries data-markdown-preview + prose class", () => {
    const { body } = render(MarkdownPreview, { props: { value: "hello" } });
    const articleMatch = body.match(/<article\b[^>]*data-markdown-preview[^>]*>/);
    expect(articleMatch).not.toBeNull();
    expect(articleMatch?.[0] ?? "").toMatch(/class="[^"]*prose[^"]*"/);
  });
});
