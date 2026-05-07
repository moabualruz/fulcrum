import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules; the
// global `[test] preload` plugin (`svelte-ssr-preload.ts`) wires this up.
// Under SSR, `browser` is always false; the wrapper must skip CodeMirror.
mock.module("$app/environment", () => ({ browser: false }));

interface MarkdownEditorProps {
  value?: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

describe("MarkdownEditor component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let MarkdownEditor: Component<MarkdownEditorProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./MarkdownEditor.svelte")) as {
      default: Component<MarkdownEditorProps>;
    };
    MarkdownEditor = mod.default;
  });

  test("default render emits the wrapper shell with cm-ready=false exactly once", () => {
    const { body } = render(MarkdownEditor, { props: { value: "" } });
    const matches = body.match(/data-markdown-editor\b[^>]*data-cm-ready="false"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  test("hidden source textarea mirrors the value prop", () => {
    const { body } = render(MarkdownEditor, { props: { value: "# heading" } });
    const sourceMatch = body.match(/<textarea\b[^>]*data-markdown-editor-source[^>]*>([\s\S]*?)<\/textarea>/);
    expect(sourceMatch).not.toBeNull();
    // Svelte SSR may either set `value=...` attribute or place text content; check both surfaces.
    const textareaTag = sourceMatch?.[0] ?? "";
    const inner = sourceMatch?.[1] ?? "";
    const carriesValue = textareaTag.includes('value="# heading"') || inner.includes("# heading");
    expect(carriesValue).toBe(true);
  });

  test("custom ariaLabel is reflected on the wrapper", () => {
    const { body } = render(MarkdownEditor, {
      props: { value: "", ariaLabel: "Document body" },
    });
    expect(body).toMatch(/data-markdown-editor\b[^>]*aria-label="Document body"/);
  });

  test("default ariaLabel falls back to 'Markdown editor'", () => {
    const { body } = render(MarkdownEditor, { props: { value: "" } });
    expect(body).toMatch(/data-markdown-editor\b[^>]*aria-label="Markdown editor"/);
  });

  test("SSR output does NOT instantiate CodeMirror DOM", () => {
    const { body } = render(MarkdownEditor, { props: { value: "x" } });
    // CodeMirror's editor root carries `cm-editor` / `cm-content` classnames in the client view.
    expect(body).not.toContain("cm-editor");
    expect(body).not.toContain("cm-content");
  });
});
