import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/settings/inference"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/environment", () => ({
  browser: false,
  dev: false,
  building: false,
  version: "",
}));

interface InferenceData {
  health: {
    status: string;
    backends: Array<{ name: string; status: string; models_loaded: number }>;
    cache: { embed_hit_rate: number; gen_hit_rate: number; db_size_bytes: number };
  } | null;
  models: Array<{
    id: string;
    name: string;
    size_bytes: number;
    downloaded: boolean;
    capabilities: string[];
  }>;
  backends: Array<{ name: string; status: string; models_loaded: number }>;
  routing: Array<{ feature: string; backend: string; model: string }>;
  externalLlmEnabled: boolean;
  error: string | null;
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      inference: Promise<InferenceData> | InferenceData;
    };
  };
};

function makeData(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    health: {
      status: "healthy",
      backends: [{ name: "llama-cpp", status: "healthy", models_loaded: 2 }],
      cache: { embed_hit_rate: 0.85, gen_hit_rate: 0.72, db_size_bytes: 1024000 },
    },
    models: [
      { id: "phi-3", name: "Phi-3 Mini", size_bytes: 2_000_000_000, downloaded: true, capabilities: ["generate", "embed"] },
      { id: "nomic-embed", name: "Nomic Embed", size_bytes: 500_000_000, downloaded: false, capabilities: ["embed"] },
    ],
    backends: [{ name: "llama-cpp", status: "healthy", models_loaded: 2 }],
    routing: [
      { feature: "embed", backend: "llama-cpp", model: "nomic-embed" },
      { feature: "generate", backend: "llama-cpp", model: "phi-3" },
    ],
    externalLlmEnabled: false,
    error: null,
    ...overrides,
  };
}

function pageData(inference: InferenceData): PageProps["data"] {
  return {
    activeProjectId: null,
    streamed: { inference },
  };
}

describe("/settings/inference +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders loading skeleton while data pending", () => {
    const pending = new Promise<InferenceData>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { inference: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
  });

  test("renders header with 'Inference Settings'", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toMatch(/<h1\b[^>]*>\s*Inference Settings\s*<\/h1>/);
  });

  test("renders backend status cards", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toContain("data-inference-backend-status");
    expect(body).toContain("data-backend-card");
    expect(body).toContain('data-backend-name="llama-cpp"');
    expect(body).toContain("data-backend-status-dot");
  });

  test("renders model rows with download/remove controls", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toContain("data-inference-models");
    expect(body).toContain('data-model-id="phi-3"');
    expect(body).toContain('data-model-id="nomic-embed"');
    expect(body).toContain('data-model-status="downloaded"');
    expect(body).toContain('data-model-status="not-downloaded"');
    expect(body).toContain("data-pull-button");
    expect(body).toContain("data-remove-button");
  });

  test("renders routing table", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toContain("data-routing-table");
    expect(body).toContain('data-feature="embed"');
    expect(body).toContain('data-feature="generate"');
  });

  test("renders cache stats", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toContain("data-inference-cache");
    expect(body).toContain("data-cache-embed-hit");
    expect(body).toContain("85.0%");
    expect(body).toContain("data-cache-size");
    expect(body).toContain("data-clear-cache");
  });

  test("renders test panels", () => {
    const { body } = render(Page, { props: { data: pageData(makeData()) } });
    expect(body).toContain("data-inference-tests");
    expect(body).toContain("data-test-embed");
    expect(body).toContain("data-test-generate");
    expect(body).toContain("data-test-classify");
    expect(body).toContain("data-test-tokenize");
    expect(body).toContain("data-test-embed-button");
    expect(body).toContain("data-test-generate-button");
  });

  test("does not render external LLM card when flag disabled", () => {
    const { body } = render(Page, { props: { data: pageData(makeData({ externalLlmEnabled: false })) } });
    expect(body).not.toContain("data-inference-external-llm");
  });

  test("renders external LLM card when flag enabled", () => {
    const { body } = render(Page, { props: { data: pageData(makeData({ externalLlmEnabled: true })) } });
    expect(body).toContain("data-inference-external-llm");
    expect(body).toContain("external-llm-provider");
  });

  test("renders error card when public API is unavailable", () => {
    const { body } = render(Page, {
      props: { data: pageData(makeData({ error: "Connection refused", health: null })) },
    });
    expect(body).toContain("data-inference-error");
    expect(body).toContain("Connection refused");
    expect(body).toContain("data-backend-unavailable");
  });

  test("renders empty states for models and routing", () => {
    const { body } = render(Page, {
      props: { data: pageData(makeData({ models: [], routing: [], health: null })) },
    });
    expect(body).toContain("No models available");
    expect(body).toContain("No routing configured");
    expect(body).toContain("Cache stats unavailable");
  });
});
