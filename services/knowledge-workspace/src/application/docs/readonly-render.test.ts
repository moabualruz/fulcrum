/**
 * Read-only renderer XSS sanitization tests (DOC-10 / T-06-13).
 *
 * Uses the root docs sanitizer. Browser component tests for DOMPurify live in
 * apps/web where DOMPurify is an explicit dependency.
 */

import { describe, expect, test } from "bun:test";
import { sanitizeDocHtml } from "./sanitize.ts";

describe("Read-only renderer XSS sanitization (DOC-10)", () => {
  test("strips script tags from rendered HTML", () => {
    const malicious = '<p>Hello</p><script>alert("xss")</script>';
    const clean = sanitizeDocHtml(malicious);
    expect(clean).not.toContain("<script>");
    expect(clean).toContain("<p>Hello</p>");
  });

  test("strips onerror attributes", () => {
    const malicious = '<img src="/x.png" onerror="alert(1)">';
    const clean = sanitizeDocHtml(malicious);
    expect(clean).not.toContain("onerror");
  });

  test("strips javascript: href links", () => {
    const malicious = '<a href="javascript:alert(1)">click</a>';
    const clean = sanitizeDocHtml(malicious);
    expect(clean).not.toContain("javascript:");
  });

  test("strips inline event handlers", () => {
    const malicious = '<div onclick="evil()">content</div>';
    const clean = sanitizeDocHtml(malicious);
    expect(clean).not.toContain("onclick");
    expect(clean).toContain("content");
  });

  test("preserves safe HTML structure", () => {
    const safe = '<h1>Title</h1><p>Body with <strong>bold</strong> and <em>italic</em></p>';
    const clean = sanitizeDocHtml(safe);
    expect(clean).toContain("<h1>Title</h1>");
    expect(clean).toContain("<strong>bold</strong>");
    expect(clean).toContain("<em>italic</em>");
  });

  test("preserves code blocks", () => {
    const safe = '<pre><code class="language-ts">const x = 1;</code></pre>';
    const clean = sanitizeDocHtml(safe);
    expect(clean).toContain("<code");
    expect(clean).toContain("const x = 1;");
  });
});
