import type { Component } from "svelte";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { svelteTiptapMock } from "$lib/test/svelte-tiptap-mock";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

// `mock.module` freezes a module's export-name set on first registration.
// `svelteTiptapMock()` carries every real `svelte-tiptap` export so sibling
// suites that import other names (`NodeViewWrapper`, …) are not frozen out.
mock.module("svelte-tiptap", () => svelteTiptapMock());

interface EditDoc {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: string;
}

type PageProps = {
  data: {
    doc: EditDoc;
    form: {
      data: { title: string; kind: string; labels: string; body: string; frontmatter?: Record<string, unknown> };
      errors: Record<string, string[]>;
    };
  };
  form: unknown;
};

const DOC: EditDoc = {
  id: "01J0DOC00000000000000000001",
  org_id: "org-1",
  project_id: null,
  kind: "adr",
  title: "ADR doc",
  body: "Body",
  frontmatter: { status: "proposed", decision: "d", context: "c", consequences: "co", extra: "preserved" },
  updated_at: "2026-04-30T12:00:00.000Z",
};

describe("/docs/[id]/edit +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders frontmatter slide-in panel with form by default and YAML toggle", () => {
    const { body } = render(Page, {
      props: {
        data: {
          doc: DOC,
          form: {
            data: { title: DOC.title, kind: DOC.kind, labels: "", body: DOC.body, frontmatter: DOC.frontmatter },
            errors: {},
          },
        },
        form: null,
      },
    });

    expect(body).toContain("data-frontmatter-panel");
    expect(body).toContain("data-frontmatter-form");
    expect(body).toContain("data-frontmatter-toggle-yaml");
    expect(body).toContain("name=\"frontmatter[consequences]\"");
    expect(body).toContain("data-required-field=\"consequences\"");
  });

  test("wires real-time collaboration presence and cursor surfaces around the editor", () => {
    const source = readFileSync(join(import.meta.dir, "+page.svelte"), "utf8");

    expect(source).toContain("createCollabProvider");
    expect(source).toContain("<PresenceAvatars users={presenceUsers} />");
    expect(source).toContain("<CursorOverlay cursors={remoteCursors} />");
    expect(source).toContain("FeatureGate flag=\"real-time-collab-server\"");
    expect(source).toContain("provider.onPresenceChange");
    expect(source).toContain("provider.onCursorChange");
    expect(source).toContain("data-collab-status-panel");
    expect(source).toContain("data-collab-connection-state");
    expect(source).toContain("data-collab-save-state");
    expect(source).toContain("data-collab-risk-state");
    expect(source).toContain("data-collab-history-context");
    expect(source).toContain("data-collab-flag-off");
  });
});
