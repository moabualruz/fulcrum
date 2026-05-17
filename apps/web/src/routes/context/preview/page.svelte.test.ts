import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/context/preview?task=task-123"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

type ContextSlice = {
  tokenCount: number;
  content: string;
};

type PageProps = {
  data: {
    taskId: string | null;
    errorMessage: string | null;
    preview: {
      bundle: {
        tokenBudget: number;
        tokenCount: number;
        slices: Record<string, ContextSlice>;
      };
      snapshotId?: string | null;
    } | null;
  };
};

const longContent = `${"A".repeat(200)}BBBB`;

function pageData(tokenCount = 75, tokenBudget = 100): PageProps["data"] {
  return {
    taskId: "task-123",
    errorMessage: null,
    preview: {
      bundle: {
        tokenBudget,
        tokenCount,
        slices: {
          memories: { tokenCount: 10, content: longContent },
          linkedDocs: { tokenCount: 20, content: "Linked docs content" },
          recentRuns: { tokenCount: 15, content: "Recent runs content" },
          repoState: { tokenCount: 5, content: "" },
          skillPrompts: { tokenCount: 25, content: "Skill prompt content" },
        },
      },
      snapshotId: "snapshot-1",
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

  test("renders five context slice panels with token counts and toggles", () => {
    const { body } = render(Page, { props: { data: pageData() } });

    for (const label of ["Memories", "Linked Docs", "Recent Runs", "Repo State", "Skill Prompts"]) {
      expect(body).toContain(label);
    }
    expect(body.match(/data-context-slice=/g) ?? []).toHaveLength(5);
    expect(body.match(/data-context-toggle/g) ?? []).toHaveLength(5);
    for (const tokenText of ["10 tokens", "20 tokens", "15 tokens", "5 tokens", "25 tokens"]) {
      expect(body).toContain(tokenText);
    }
    expect(body).toContain("75 / 100 tokens");
  });

  test("limits collapsed content preview to the first 200 characters", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("A".repeat(200));
    expect(body).not.toContain("BBBB");
  });

  test("highlights over-budget bundles", () => {
    const { body } = render(Page, { props: { data: pageData(125, 100) } });
    expect(body).toContain("data-over-budget");
    expect(body).toContain("125 / 100 tokens");
  });

  test("renders empty repo state gracefully", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("No repo context available.");
  });

  test("renders load error state", () => {
    const { body } = render(Page, {
      props: {
        data: {
          taskId: null,
          preview: null,
          errorMessage: "Add ?task=<id> to preview assembled context.",
        },
      },
    });
    expect(body).toContain("data-context-preview-error");
    expect(body).toContain("Add ?task=&lt;id> to preview assembled context.");
  });
});
