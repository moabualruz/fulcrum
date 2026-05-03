import { describe, expect, test } from "bun:test";

import {
  SAFE_DOC_ELEMENTS,
  renderDocToHtml,
  sanitizeDocHtml,
  sanitizeDocJsonFields,
} from "../../src/docs/sanitize.ts";

describe("docs sanitization pipeline", () => {
  test("sanitizeDocHtml strips script tags and their contents", () => {
    const html = sanitizeDocHtml("<h1>Safe</h1><script>alert(1)</script><p>After</p>");

    expect(html).toContain("<h1>Safe</h1>");
    expect(html).toContain("<p>After</p>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
  });

  test("sanitizeDocHtml strips event handler attributes from allowed elements", () => {
    const html = sanitizeDocHtml(
      '<img src="/chart.png" alt="Chart" onerror="alert(1)"><p onclick="steal()">Read</p>',
    );

    expect(html).toContain("<img");
    expect(html).toContain('src="/chart.png"');
    expect(html).toContain('alt="Chart"');
    expect(html).toContain("<p>Read</p>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onclick");
  });

  test("sanitizeDocHtml strips dangerous URL values", () => {
    const html = sanitizeDocHtml(
      '<a href="javascript:alert(1)">bad</a><img src="data:text/html,<script>alert(2)</script>" alt="bad">',
    );

    expect(html).toContain("<a>bad</a>");
    expect(html).toContain('<img alt="bad">');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
  });

  test("sanitizeDocHtml keeps doc-safe elements and sandboxed iframes only", () => {
    const html = sanitizeDocHtml(`
      <h2>Title</h2><ul><li><strong>one</strong></li></ul>
      <table><thead><tr><th>H</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table>
      <pre><code class="language-ts">const ok = true;</code></pre>
      <blockquote><em>quoted</em></blockquote>
      <figure><span class="katex-html">x</span></figure>
      <iframe sandbox="allow-scripts" src="/mermaid.html"></iframe>
      <iframe src="/unsafe.html"></iframe>
    `);

    const expectedTags: Array<(typeof SAFE_DOC_ELEMENTS)[number]> = [
      "h2",
      "ul",
      "li",
      "strong",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "pre",
      "code",
      "blockquote",
      "em",
      "figure",
      "span",
    ];
    for (const tag of expectedTags) {
      expect(SAFE_DOC_ELEMENTS).toContain(tag);
      expect(html).toContain(`<${tag}`);
    }
    expect(html).toContain('<iframe sandbox="allow-scripts" src="/mermaid.html"></iframe>');
    expect(html).not.toContain("/unsafe.html");
  });

  test("sanitizeDocHtml handles malformed and mixed-case payloads", () => {
    const html = sanitizeDocHtml('<IMG SRC="JaVaScRiPt:alert(1)" ONLOAD=alert(2)><scr<script>ipt>x</script>');

    expect(html.toLowerCase()).toContain("<img>");
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("onload");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  test("sanitizeDocJsonFields recursively sanitizes string fields without mutating input", () => {
    const input = {
      type: "doc",
      attrs: {
        href: "javascript:alert(1)",
        title: '<img src=x onerror="alert(1)">Title',
      },
      content: [
        { type: "text", text: "Hello <script>alert(1)</script>" },
        { type: "image", attrs: { src: "https://example.com/image.png", alt: "Safe" } },
      ],
    };

    const sanitized = sanitizeDocJsonFields(input);

    expect(sanitized).toEqual({
      type: "doc",
      attrs: {
        href: "",
        title: "<img>Title",
      },
      content: [
        { type: "text", text: "Hello " },
        { type: "image", attrs: { src: "https://example.com/image.png", alt: "Safe" } },
      ],
    });
    expect(input.attrs.href).toBe("javascript:alert(1)");
  });

  test("renderDocToHtml returns sanitized rendered markdown with highlighted code spans", async () => {
    const html = await renderDocToHtml(`
# Title

[bad](javascript:alert(1))

<script>alert(1)</script>

\`\`\`typescript
const ok = true;
\`\`\`
`);

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<a>bad</a>");
    expect(html).toContain('class="language-typescript"');
    expect(html).toContain('class="token keyword"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
