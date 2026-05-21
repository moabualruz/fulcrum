import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/context/preview?taskId=task-123"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

// The context-preview route was rebuilt around the streamed `ContextBundle`
// shape (`@knowledge-workspace` `loadContextBundle` / `loadContextPreviewOptions`).
// `+page.svelte` reads `data.streamed.options` and `data.streamed.bundle`; SSR
// `render()` runs synchronously, and Svelte's `{#await}` renders its `:then`
// branch immediately when the awaited value is a plain (non-thenable) value —
// so the tests pass resolved objects, not Promises, to exercise the panes.

type MemorySlice = { id: string; key: string; body: string };
type DocSlice = { id: string; title: string; body_excerpt: string };
type RunSlice = { id: string; agent: string; status: string; started_at: string };
type ArtifactSlice = { id: string; kind: string; title: string };

type ContextBundle = {
  memories: MemorySlice[];
  documents: DocSlice[];
  recentRuns: RunSlice[];
  artifacts: ArtifactSlice[];
  tokenBudget: { used: number; total: number };
};

type PreviewOptions = {
  projects: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
};

type PageProps = {
  data: {
    activeProjectId: string | null;
    selectedProjectId: string | null;
    selectedTaskId: string | null;
    streamed: {
      options: PreviewOptions;
      bundle: ContextBundle | Promise<ContextBundle> | null;
    };
  };
};

const OPTIONS: PreviewOptions = {
  projects: [{ id: "project-1", name: "Fulcrum" }],
  tasks: [{ id: "task-123", title: "Wire context preview", status: "open" }],
};

function bundle(used = 75, total = 100): ContextBundle {
  return {
    memories: [
      { id: "mem-1", key: "auth.decision", body: "Use the existing session cookie." },
      { id: "mem-2", key: "repo.layout", body: "Services live under services/." },
    ],
    documents: [{ id: "doc-1", title: "Auth rewrite", body_excerpt: "Plan for the auth rewrite." }],
    recentRuns: [{ id: "run-1", agent: "claude-code", status: "succeeded", started_at: "2026-05-01T10:00:00.000Z" }],
    artifacts: [
      { id: "art-1", kind: "diff", title: "auth.patch" },
      { id: "art-2", kind: "report", title: "review.md" },
      { id: "art-3", kind: "plan", title: "rollout.md" },
    ],
    tokenBudget: { used, total },
  };
}

function pageData(over = false): PageProps["data"] {
  return {
    activeProjectId: "project-1",
    selectedProjectId: "project-1",
    selectedTaskId: "task-123",
    streamed: {
      options: OPTIONS,
      bundle: over ? bundle(125, 100) : bundle(),
    },
  };
}

describe("/context/preview +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders the four context panes with counts and project/task selectors", () => {
    const { body } = render(Page, { props: { data: pageData() } });

    expect(body).toContain("data-context-header");
    expect(body).toContain("Context preview");

    // The selector form drives project + task scoping.
    expect(body).toContain("data-context-selectors");
    expect(body).toContain("data-project-select");
    expect(body).toContain("data-task-select");

    // Four context panes, each with its count from the bundle slices.
    expect(body).toContain("data-context-panes");
    for (const hook of ["data-pane-memories", "data-pane-documents", "data-pane-runs", "data-pane-artifacts"]) {
      expect(body).toContain(hook);
    }
    expect(body).toContain("Memories (2)");
    expect(body).toContain("Linked docs (1)");
    expect(body).toContain("Recent runs (1)");
    expect(body).toContain("Artifacts (3)");
  });

  test("renders slice content from each pane", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("auth.decision");
    expect(body).toContain("Auth rewrite");
    expect(body).toContain("claude-code");
    expect(body).toContain("auth.patch");
  });

  test("renders the token budget bar with used / total counts", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("data-token-budget");
    expect(body).toContain("data-budget-bar");
    expect(body).toContain("75 / 100 (75%)");
  });

  test("over-budget bundles drive the budget bar past 100%", () => {
    const { body } = render(Page, { props: { data: pageData(true) } });
    expect(body).toContain("125 / 100 (125%)");
    // >90% utilisation switches the bar to the red tone.
    expect(body).toContain("bg-red-500");
  });

  test("renders the empty bundle state when no task is selected", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: "project-1",
          selectedProjectId: "project-1",
          selectedTaskId: null,
          streamed: { options: OPTIONS, bundle: null },
        },
      },
    });
    expect(body).toContain("data-context-empty");
    expect(body).toContain("Select a project and task, then click Preview to see the context bundle.");
  });

  test("the bundle await block carries a failure branch surfacing the assembly error", () => {
    // The bundle-assembly failure is rendered by the `{#await}` `:catch`
    // branch. Svelte SSR `render()` is synchronous and always renders the
    // *pending* branch for a thenable — it can never reach `:catch` — so the
    // surviving coverage intent (a failure branch exists and surfaces the
    // error message) is asserted against the source structure instead.
    const pageSrc = readFileSync(
      fileURLToPath(new URL("./+page.svelte", import.meta.url)),
      "utf8",
    );
    const awaitOpen = pageSrc.indexOf("{#await data.streamed.bundle}");
    expect(awaitOpen).toBeGreaterThan(-1);
    const awaitClose = pageSrc.indexOf("{/await}", awaitOpen);
    expect(awaitClose).toBeGreaterThan(awaitOpen);
    const block = pageSrc.slice(awaitOpen, awaitClose);
    expect(block).toContain("{:catch err}");
    expect(block).toContain("Failed to assemble context:");
    expect(block).toContain("err.message");
  });
});
