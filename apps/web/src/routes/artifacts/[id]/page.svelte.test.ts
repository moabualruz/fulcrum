import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
}));

interface ArtifactDetail {
  id: string;
  kind: string;
  title: string;
  mime: string | null;
  content: string | null;
  body_path: string | null;
  downloadHref: string;
  retentionDaysRemaining: number;
}

type PageProps = {
  data: {
    streamed: { data: { artifact: ArtifactDetail } | Promise<{ artifact: ArtifactDetail }> };
  };
};

describe("/artifacts/[id] +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders inline preview, download link, delete action, and retention info", () => {
    const { body } = render(Page, {
      props: {
        data: {
          streamed: {
            data: {
              artifact: {
                id: "a1",
                kind: "code",
                title: "report.ts",
                mime: "text/typescript",
                content: "const x = 1;",
                body_path: "/tmp/report.ts",
                downloadHref: "/artifacts/a1/download",
                retentionDaysRemaining: 29,
              },
            },
          },
        },
      },
    });
    expect(body).toContain("data-artifact-detail-header");
    expect(body).toContain("data-artifact-detail-metadata");
    expect(body).toContain("data-artifact-inline-preview");
    expect(body).toContain("const x = 1;");
    expect(body).toContain("data-artifact-download");
    expect(body).toContain('href="/artifacts/a1/download"');
    expect(body).toContain("data-artifact-delete");
    expect(body).toContain("29 days remaining");
  });
});
