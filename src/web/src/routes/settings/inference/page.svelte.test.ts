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
    classifyResults?: Array<{ label: string; score: number }>;
    tokenizeResult?: { count: number; tokens: string[] };
    generateText?: string;
    generateTokens?: number;
    generateError?: string;
    schemaValid?: boolean;
    error?: string;
    pullProgress?: { modelId: string; pct: number; downloaded: number; total: number };
  } | null;
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

  test("renders test classify and tokenize panels with results", () => {
    const { body } = render(Page, {
      props: {
        data,
        form: {
          success: true,
          classifyResults: [
            { label: "task", score: 0.91 },
            { label: "question", score: 0.2 },
          ],
          tokenizeResult: { count: 2, tokens: ["hello", "world"] },
        },
      },
    });

    expect(body).toContain("Test classify");
    expect(body).toContain('name="labels"');
    expect(body).toContain('data-classify-results="2"');
    expect(body).toContain("task");
    expect(body).toContain("0.91");
    expect(body).toContain("Test tokenize");
    expect(body).toContain('data-tokenize-count="2"');
    expect(body).toContain("hello");
    expect(body).toContain("world");
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

  test("renders JSON Schema textarea in test generate panel", () => {
    const { body } = render(Page, {
      props: { data, form: null },
    });

    expect(body).toContain('name="schema"');
    expect(body).toContain("JSON Schema");
  });

  test("renders schema validity indicator when schema output present", () => {
    const { body } = render(Page, {
      props: {
        data,
        form: {
          success: true,
          generateText: '{"agent": "router"}',
          generateTokens: 5,
          schemaValid: true,
        },
      },
    });

    expect(body).toContain('data-schema-valid="true"');
    expect(body).toContain('data-schema-output');
    expect(body).toContain('{"agent": "router"}');
  });

  test("renders smoke embed error state without throwing", () => {
    const { body } = render(Page, {
      props: { data, form: { success: false, error: "sidecar unavailable" } },
    });

    expect(body).toContain("sidecar unavailable");
    expect(body).toContain('data-embed-error');
  });
});
