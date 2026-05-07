// @vitest-environment happy-dom
/**
 * Read-only renderer XSS sanitization tests (DOC-10 / T-06-13).
 *
 * Uses DOMPurify directly to verify the same sanitization applied by
 * ReadOnlyRenderer.svelte. The Svelte component wraps the same DOMPurify call.
 */

import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";

describe("Read-only renderer XSS sanitization (DOC-10)", () => {
  it("strips script tags from rendered HTML", () => {
    const malicious = '<p>Hello</p><script>alert("xss")</script>';
    const clean = DOMPurify.sanitize(malicious);
    expect(clean).not.toContain("<script>");
    expect(clean).toContain("<p>Hello</p>");
  });

  it("strips onerror attributes", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const clean = DOMPurify.sanitize(malicious);
    expect(clean).not.toContain("onerror");
  });

  it("strips javascript: href links", () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const clean = DOMPurify.sanitize(malicious);
    expect(clean).not.toContain("javascript:");
  });

  it("strips inline event handlers", () => {
    const malicious = '<div onclick="evil()">content</div>';
    const clean = DOMPurify.sanitize(malicious);
    expect(clean).not.toContain("onclick");
    expect(clean).toContain("content");
  });

  it("preserves safe HTML structure", () => {
    const safe = '<h1>Title</h1><p>Body with <strong>bold</strong> and <em>italic</em></p>';
    const clean = DOMPurify.sanitize(safe);
    expect(clean).toContain("<h1>Title</h1>");
    expect(clean).toContain("<strong>bold</strong>");
    expect(clean).toContain("<em>italic</em>");
  });

  it("preserves code blocks", () => {
    const safe = '<pre><code class="language-ts">const x = 1;</code></pre>';
    const clean = DOMPurify.sanitize(safe);
    expect(clean).toContain("<code");
    expect(clean).toContain("const x = 1;");
  });
});
