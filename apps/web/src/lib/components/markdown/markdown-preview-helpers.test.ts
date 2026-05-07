import { describe, expect, test } from "bun:test";

import { renderMarkdownToHtml } from "./markdown-preview-helpers";

describe("renderMarkdownToHtml", () => {
  test("renders `# Hello` as an <h1>Hello</h1>", () => {
    const out = renderMarkdownToHtml("# Hello");
    expect(out).toMatch(/<h1[^>]*>Hello<\/h1>/);
  });

  test("preserves links with href + label", () => {
    const out = renderMarkdownToHtml("[link](https://example.com)");
    expect(out).toMatch(/<a[^>]*href="https:\/\/example\.com"[^>]*>link<\/a>/);
  });

  test("strips <script> tags entirely", () => {
    const out = renderMarkdownToHtml("<script>alert('xss')</script>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  test("strips on* event handler attributes from img", () => {
    const out = renderMarkdownToHtml("<img src=x onerror=alert(1)>");
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  test("preserves markdown image syntax", () => {
    const out = renderMarkdownToHtml("![alt](https://e.com/i.png)");
    expect(out).toMatch(/<img[^>]*src="https:\/\/e\.com\/i\.png"[^>]*alt="alt"[^>]*>/);
  });

  test("empty input returns empty string", () => {
    expect(renderMarkdownToHtml("")).toBe("");
  });

  test("plain paragraph renders within <p> tags", () => {
    const out = renderMarkdownToHtml("hello");
    expect(out).toMatch(/<p[^>]*>hello<\/p>/);
  });
});
