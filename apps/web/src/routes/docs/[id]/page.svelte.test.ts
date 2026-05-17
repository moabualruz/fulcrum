import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/docs/doc-1"),
    params: { id: "doc-1" },
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

interface DocDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: string;
}

interface DocBacklink {
  id: string;
  title?: string;
  href: string;
}

interface DocComment {
  id: string;
  bodyMd: string;
  authorId: string;
  resolved: boolean;
  parentCommentId: string | null;
}

interface DocAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  href: string;
}

interface DocPayload {
  doc: DocDetail;
  backlinks: DocBacklink[];
  comments: DocComment[];
  attachments: DocAttachment[];
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data: Promise<DocPayload> | DocPayload;
    };
  };
};

const DOC: DocDetail = {
  id: "01J0DOC00000000000000000001",
  org_id: "org-1",
  project_id: null,
  kind: "spec",
  title: "Spec doc",
  body: "## Body\n\nDocument content",
  frontmatter: {},
  updated_at: "2026-04-30T12:00:00.000Z",
};

const PAYLOAD: DocPayload = {
  doc: DOC,
  backlinks: [{ id: "source-doc", title: "Source Doc", href: "/docs/source-doc" }],
  comments: [
    {
      id: "comment-1",
      bodyMd: "Needs acceptance criteria.",
      authorId: "user-2",
      resolved: false,
      parentCommentId: null,
    },
    {
      id: "comment-2",
      bodyMd: "Resolved note.",
      authorId: "user-1",
      resolved: true,
      parentCommentId: "comment-1",
    },
  ],
  attachments: [
    {
      id: "attachment-1",
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      href: "/doc-attachments/brief.pdf",
    },
  ],
};

describe("/docs/[id] +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders detail RouteSkeleton while streamed data is pending", () => {
    const pending = new Promise<DocPayload>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="detail"');
  });

  test("renders document detail from streamed payload", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: PAYLOAD } } },
    });
    expect(body).toContain("data-doc-title");
    expect(body).toContain(DOC.title);
    expect(body).toContain("data-markdown-preview");
    expect(body).toContain('href="/docs/01J0DOC00000000000000000001/edit"');
  });

  test("renders backlinks, document comments, and attachments from the streamed payload", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: PAYLOAD } } },
    });

    expect(body).toContain("data-backlinks-sidebar");
    expect(body).toContain('href="/docs/source-doc"');
    expect(body).toContain("Source Doc");
    expect(body).toContain("data-doc-comments");
    expect(body).toContain("Needs acceptance criteria.");
    expect(body).toContain("Resolved note.");
    expect(body).toContain('name="bodyMd"');
    expect(body).toContain('name="commentId"');
    expect(body).toContain('value="comment-1"');
    expect(body).not.toContain('value="comment-2"');
    expect(body).toContain("data-doc-attachments");
    expect(body).toContain("brief.pdf");
    expect(body).toContain("application/pdf");
    expect(body).toContain('href="/doc-attachments/brief.pdf"');
  });
});
