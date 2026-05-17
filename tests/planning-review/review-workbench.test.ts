import { describe, expect, test } from "bun:test";
import { buildReviewWorkbenchModel, type ReviewWorkbenchDiffFile } from "@planning-review/application/reviews/review-workbench.ts";
import type { CodeReviewAnnotation } from "@planning-review/application/reviews/shared/review-feedback.ts";

const files: ReviewWorkbenchDiffFile[] = [
  {
    path: "src/app/main.ts",
    patch: [
      "diff --git a/src/app/main.ts b/src/app/main.ts",
      "@@ -1,3 +1,4 @@",
      " export function main() {",
      '-  return "old trace";',
      '+  return "new trace";',
      "+  console.log(traceId);",
      " }",
    ].join("\n"),
    additions: 2,
    deletions: 1,
  },
  {
    path: "src/app/helper.ts",
    patch: [
      "diff --git a/src/app/helper.ts b/src/app/helper.ts",
      "@@ -10,2 +10,2 @@",
      "-export const helper = false;",
      "+export const helper = traceReady;",
    ].join("\n"),
    additions: 1,
    deletions: 1,
  },
  {
    path: "docs/plan.md",
    patch: "@@ -1 +1 @@\n+Trace criteria documented",
    additions: 1,
    deletions: 0,
  },
];

const annotations: CodeReviewAnnotation[] = [
  {
    id: "ann-line-late",
    type: "comment",
    filePath: "src/app/main.ts",
    lineStart: 20,
    lineEnd: 20,
    side: "new",
    text: "Later line note",
    createdAt: 3,
  },
  {
    id: "ann-suggestion",
    type: "suggestion",
    filePath: "src/app/main.ts",
    lineStart: 2,
    lineEnd: 2,
    side: "new",
    text: "Use the trace helper before returning.",
    originalCode: 'return "old trace";',
    suggestedCode: 'return traceResult("new trace");',
    conventionalLabel: "suggestion",
    createdAt: 2,
  },
  {
    id: "ann-file",
    type: "concern",
    scope: "file",
    filePath: "src/app/main.ts",
    lineStart: 1,
    lineEnd: 1,
    side: "new",
    text: "Main entry point needs UAT review.",
    decorations: ["blocking"],
    severity: "important",
    createdAt: 1,
  },
  {
    id: "ann-full-stack",
    type: "comment",
    filePath: "src/app/helper.ts",
    lineStart: 10,
    lineEnd: 10,
    side: "new",
    text: "This belongs to the full-stack review packet.",
    diffScope: "full-stack",
    createdAt: 4,
  },
];

describe("review planning behavior behavior", () => {
  test("builds review workbench state for files, annotations, search, submissions, suggestions, and live logs", () => {
    const model = buildReviewWorkbenchModel({
      projectId: "project-review",
      traceId: "trace-review-workbench",
      reviewId: "review-uat-1",
      files,
      annotations,
      selectedFilePath: "missing.ts",
      viewedFilePaths: ["src/app/helper.ts"],
      hideViewedFiles: true,
      searchQuery: "trace",
      activeSearchMatchId: "src/app/main.ts:addition:2:14:0",
      liveLog: {
        content: ["boot", "loading", "running trace", "finished"].join("\n"),
        isLive: true,
        maxRenderSize: 24,
      },
      currentPrUrl: "https://github.com/acme/fulcrum/pull/42",
      currentPrMeta: {
        number: 42,
        title: "workflow review",
        repo: "acme/fulcrum",
      },
      editorAnnotations: [
        {
          filePath: "src/app/main.ts",
          lineStart: 2,
          lineEnd: 3,
          selectedText: "return trace",
          comment: "Editor-originated UAT note",
        },
      ],
    });

    expect(model.summary).toMatchObject({
      fileCount: 3,
      visibleFileCount: 2,
      viewedFileCount: 1,
      annotationCount: 4,
      blockingAnnotationCount: 1,
      suggestionCount: 1,
      searchMatchCount: 5,
      hasLiveOutput: true,
    });
    expect(model.projectId).toBe("project-review");
    expect(model.traceId).toBe("trace-review-workbench");
    expect(model.reviewId).toBe("review-uat-1");
    expect(model.selectedFile?.path).toBe("src/app/main.ts");
    expect(model.visibleFiles.map((file) => file.path)).toEqual(["src/app/main.ts", "docs/plan.md"]);

    const mainGroup = model.annotationGroups.find((group) => group.filePath === "src/app/main.ts");
    expect(mainGroup?.annotations.map((annotation) => annotation.id)).toEqual([
      "ann-file",
      "ann-suggestion",
      "ann-line-late",
    ]);
    expect(mainGroup?.blockingCount).toBe(1);

    expect(model.fileTree.flatMap((node) => [node.name, ...(node.children?.map((child) => child.name) ?? [])])).toContain(
      "src/app",
    );
    expect(model.fileTreeStats.get("src/app/main.ts")).toMatchObject({
      annotationCount: 3,
      searchMatchCount: 3,
      viewed: false,
    });
    expect(model.fileTreeStats.get("src/app/helper.ts")).toMatchObject({
      annotationCount: 1,
      searchMatchCount: 1,
      viewed: true,
    });

    expect(model.search.groups.map((group) => [group.filePath, group.matches.length])).toEqual([
      ["src/app/main.ts", 3],
      ["src/app/helper.ts", 1],
      ["docs/plan.md", 1],
    ]);
    expect(model.search.activeMatch?.id).toBe("src/app/main.ts:addition:2:14:0");
    expect(model.search.nextMatchId).toBe("src/app/main.ts:addition:3:14:0");
    expect(model.search.previousMatchId).toBe("src/app/main.ts:deletion:2:14:0");

    expect(model.suggestions).toEqual([
      {
        annotationId: "ann-suggestion",
        filePath: "src/app/main.ts",
        lineStart: 2,
        lineEnd: 2,
        canApply: true,
        originalCode: 'return "old trace";',
        suggestedCode: 'return traceResult("new trace");',
      },
    ]);
    expect(model.feedbackMarkdown).toContain("# Code Review Feedback");
    expect(model.feedbackMarkdown).toContain("Use the trace helper before returning.");

    expect(model.submission.targets).toHaveLength(1);
    expect(model.submission.targets[0]).toMatchObject({
      prUrl: "https://github.com/acme/fulcrum/pull/42",
      prNumber: 42,
      prTitle: "workflow review",
      prRepo: "acme/fulcrum",
      fileCount: 1,
      annotationCount: 3,
      status: "pending",
    });
    expect(model.submission.targets[0]?.fileComments.map((comment) => [comment.path, comment.line, comment.side])).toEqual([
      ["src/app/main.ts", 2, "RIGHT"],
      ["src/app/main.ts", 20, "RIGHT"],
      ["src/app/main.ts", 3, "RIGHT"],
    ]);
    expect(model.submission.targets[0]?.fileScopedBody).toContain("Main entry point needs UAT review.");
    expect(model.submission.orphans).toHaveLength(1);
    expect(model.submission.orphans[0]).toMatchObject({ reason: "full-stack" });
    expect(model.submission.orphans[0]?.markdown).toContain("full-stack review packet");

    expect(model.liveLog.displayText).toBe("[earlier output truncated]\nrunning trace\nfinished");
    expect(model.liveLog.truncated).toBe(true);
    expect(model.liveLog.isWaiting).toBe(false);
  });
});
