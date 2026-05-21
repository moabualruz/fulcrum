/**
 * Complete `mock.module` factory for `svelte-tiptap`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration. Three Svelte component tests
 * (`board/page-manual-workbench`, `sprint/[sprintId]/page`, `docs/[id]/edit`)
 * mock `svelte-tiptap` with only `createEditor` + `EditorContent`. That froze
 * the export-name set to those two, so any component pulled in by a sibling
 * suite that imports another `svelte-tiptap` export (`NodeViewWrapper`,
 * `SvelteNodeViewRenderer`, `BubbleMenu`, …) resolved `undefined` and crashed.
 *
 * `svelteTiptapMock()` returns an object carrying *every* real `svelte-tiptap`
 * export name. `createEditor` / `EditorContent` get the lightweight stubs the
 * component tests rely on; the remaining exports are inert placeholders that
 * are merely present so the export-name set is always complete regardless of
 * test order. The component tests do not exercise the placeholder exports.
 */

/** Inert component placeholder — rendered as a bare `<div>` by the test renderer. */
const EDITOR_CONTENT_STUB = "div";

function noopComponent() {
  return { $$render: () => "" };
}

export function svelteTiptapMock(): Record<string, unknown> {
  return {
    // Stubs the three component tests rely on.
    createEditor: () => ({ subscribe: () => () => {} }),
    EditorContent: EDITOR_CONTENT_STUB,
    // Remaining real export names — present so the set is never frozen short.
    Editor: class EditorStub {},
    SvelteRenderer: class SvelteRendererStub {},
    SvelteNodeViewRenderer: () => noopComponent(),
    NodeViewWrapper: EDITOR_CONTENT_STUB,
    NodeViewContent: EDITOR_CONTENT_STUB,
    BubbleMenu: EDITOR_CONTENT_STUB,
    FloatingMenu: EDITOR_CONTENT_STUB,
    TIPTAP_NODE_VIEW: "tiptap-node-view",
    invariant: (condition: unknown, message?: string) => {
      if (!condition) throw new Error(message ?? "invariant failed");
    },
    runIfFn: (value: unknown, ...args: unknown[]) =>
      typeof value === "function" ? (value as (...a: unknown[]) => unknown)(...args) : value,
  };
}
