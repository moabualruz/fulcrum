import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    streamed: {
      health: Promise<{ status: string; backends: string[]; models: string[] }> | { status: string; backends: string[]; models: string[] };
      models: Promise<Array<{ id: string; kind: string; downloaded: boolean; active: boolean; sizeBytes?: number }>>
        | Array<{ id: string; kind: string; downloaded: boolean; active: boolean; sizeBytes?: number }>;
    };
  };
  form?: {
    success?: boolean;
    dimensions?: number;
    preview?: number[];
    model?: string;
    cached?: boolean;
    error?: string;
    pullProgress?: { modelId: string; pct: number; downloaded: number; total: number };
  };
};

const data: PageProps["data"] = {
  streamed: {
    health: { status: "ok", backends: ["embedded"], models: ["BAAI/bge-small-en-v1.5"] },
    models: [{
      id: "BAAI/bge-small-en-v1.5",
      kind: "embed",
      downloaded: false,
      active: true,
      sizeBytes: 133466304,
    }],
  },
};

describe("/settings/inference +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders test embed form and successful smoke result", () => {
    const { body } = render(Page, {
      props: {
        data,
        form: {
          success: true,
          dimensions: 384,
          preview: [0.11, 0.22, 0.33, 0.44, 0.55],
          model: "BAAI/bge-small-en-v1.5",
          cached: false,
        },
      },
    });

    expect(body).toContain("Test embed");
    expect(body).toContain('name="text"');
    expect(body).toContain('data-embed-dimensions="384"');
    expect(body).toContain("0.11");
    expect(body).toContain("0.55");
  });

  test("renders download control for missing models and progress overlay state", () => {
    const { body } = render(Page, {
      props: {
        data,
        form: {
          pullProgress: { modelId: "BAAI/bge-small-en-v1.5", pct: 100, downloaded: 100, total: 100 },
        },
      },
    });

    expect(body).toContain("Download");
    expect(body).toContain('name="modelId"');
    expect(body).toContain('data-model-download-progress="100"');
    expect(body).toContain("BAAI/bge-small-en-v1.5");
  });

  test("renders smoke embed error state without throwing", () => {
    const { body } = render(Page, {
      props: { data, form: { success: false, error: "sidecar unavailable" } },
    });

    expect(body).toContain("sidecar unavailable");
    expect(body).toContain('data-embed-error');
  });
});
