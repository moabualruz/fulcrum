import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./ReviewWorkbench.svelte", import.meta.url), "utf8");

describe("ReviewWorkbench component", () => {
  let render: typeof import("svelte/server").render;
  let ReviewWorkbench: Component<{ model: ReturnType<typeof model> }>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./ReviewWorkbench.svelte")) as { default: Component<{ model: ReturnType<typeof model> }> };
    ReviewWorkbench = mod.default;
  });

  test("renders file tree, diff pane, annotations, search, AI, feedback, and approval controls", () => {
    const { body } = render(ReviewWorkbench, { props: { model: model() } });

    expect(body).toContain("data-review-workbench");
    expect(body).toContain("data-review-file-tree");
    expect(body).toContain("src/app.ts");
    expect(body).toContain("data-review-diff-pane");
    expect(body).toContain('data-diff-line="0"');
    expect(body).toContain("data-annotation-sidebar");
    expect(body).toContain("data-review-send-feedback");
    expect(body).toContain("data-review-approve");
    expect(body).toContain("data-live-log");

    expect(source).toContain("data-annotation-id");
    expect(source).toContain("data-annotation-draft");
    expect(source).toContain("data-annotation-selected-text");
    expect(source).toContain("selectedText: lines.map(cleanPatchLine).join");
    expect(source).toContain("side: annotationDraft.side");
    expect(source).toContain("originalCode: annotationDraft.selectedText");
    expect(source).toContain("data-review-search");
    expect(source).toContain("data-search-results");
    expect(source).toContain("data-review-ai-panel");
    expect(source).toContain("data-review-ai-input");
    expect(source).toContain("data-review-ai-ask");
    expect(source).toContain("new EventSource(`${aiStreamUrl}?${params.toString()}`)");
    expect(source).toContain('aiEventSource.addEventListener("done"');
  });
});

function model() {
  return {
    projectId: "project-1",
    traceId: "trace-review-1",
    reviewId: "review-1",
    files: [
      {
        path: "src/app.ts",
        patch: "+const value = 1;",
        additions: 1,
        deletions: 0,
        active: true,
        viewed: false,
        annotationCount: 1,
        searchMatchCount: 1,
      },
    ],
    selectedFile: {
      path: "src/app.ts",
      patch: "+const value = 1;",
      additions: 1,
      deletions: 0,
      annotationCount: 1,
      searchMatchCount: 1,
    },
    fileTree: [
      {
        type: "file" as const,
        name: "app.ts",
        path: "src/app.ts",
        additions: 1,
        deletions: 0,
        fileIndex: 0,
      },
    ],
    annotationGroups: [
      {
        filePath: "src/app.ts",
        blockingCount: 1,
        suggestionCount: 1,
        annotations: [
          {
            id: "ann-1",
            type: "suggestion",
            scope: "line" as const,
            filePath: "src/app.ts",
            lineStart: 1,
            lineEnd: 1,
            text: "Review this line",
            severity: "important",
            suggestedCode: "const value = 2;",
          },
        ],
      },
    ],
    search: {
      query: "value",
      groups: [
        {
          filePath: "src/app.ts",
          matches: [{ id: "match-1", filePath: "src/app.ts", side: "addition" as const, lineNumber: 1, snippet: "value" }],
        },
      ],
      activeMatch: null,
    },
    suggestions: [
      {
        annotationId: "ann-1",
        filePath: "src/app.ts",
        lineStart: 1,
        lineEnd: 1,
        canApply: true,
        suggestedCode: "const value = 2;",
      },
    ],
    feedbackMarkdown: "Please adjust the implementation.",
    liveLog: { displayText: "Reviewer running", isLive: true, hasOutput: true },
    summary: {
      fileCount: 1,
      viewedFileCount: 0,
      annotationCount: 1,
      blockingAnnotationCount: 1,
      suggestionCount: 1,
      searchMatchCount: 1,
    },
  };
}
