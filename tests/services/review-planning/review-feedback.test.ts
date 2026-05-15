import { describe, expect, test } from "bun:test";
import {
  exportReviewFeedback,
  formatConventionalPrefix,
  type CodeReviewAnnotation,
  type PullRequestMetadata,
} from "@planning-review/application/reviews/shared/review-feedback.ts";

const annotation = (overrides: Partial<CodeReviewAnnotation> = {}): CodeReviewAnnotation => ({
  id: "ann-1",
  type: "comment",
  filePath: "src/index.ts",
  lineStart: 10,
  lineEnd: 10,
  side: "new",
  text: "This looks wrong",
  createdAt: 1,
  ...overrides,
});

const prMeta: PullRequestMetadata = {
  platform: "github",
  host: "github.com",
  owner: "acme",
  repo: "widgets",
  number: 42,
  title: "fix: broken widget",
  author: "alice",
  baseBranch: "main",
  headBranch: "fix/widget",
  baseSha: "abc123",
  headSha: "def456",
  url: "https://github.com/acme/widgets/pull/42",
};

describe("review planning behavior behavior", () => {
  test("formats Conventional Comments prefixes", () => {
    expect(formatConventionalPrefix()).toBe("");
    expect(formatConventionalPrefix("nitpick")).toBe("**nitpick:** ");
    expect(formatConventionalPrefix("suggestion", ["blocking", "if-minor"])).toBe(
      "**suggestion (blocking, if-minor):** ",
    );
  });

  test("exports local review feedback with optional diff context and no PR leakage", () => {
    const result = exportReviewFeedback([annotation()], undefined, {
      mode: "branch",
      base: "develop",
      worktreePath: "/tmp/feature-wt",
    });

    expect(result.startsWith("# Code Review Feedback\n\n")).toBe(true);
    expect(result).toContain("**Diff:** Branch diff vs `develop` _(worktree: /tmp/feature-wt)_");
    expect(result).toContain("## src/index.ts");
    expect(result).toContain("### Line 10 (new)");
    expect(result).toContain("This looks wrong");
    expect(result).not.toContain("PR Review");
    expect(result).not.toContain("github.com");
    expect(result).not.toContain("Branch:");
  });

  test("exports PR review context and ignores local diff context", () => {
    const result = exportReviewFeedback([annotation({ text: "needs fix" })], prMeta, {
      mode: "branch",
      base: "develop",
    });

    expect(result.startsWith("# PR Review: acme/widgets#42\n\n")).toBe(true);
    expect(result).toContain("**fix: broken widget**");
    expect(result).toContain("Branch: `fix/widget` -> `main`");
    expect(result).toContain("https://github.com/acme/widgets/pull/42");
    expect(result).toContain("needs fix");
    expect(result).not.toContain("**Diff:**");
  });

  test("returns generic empty feedback when there are no annotations", () => {
    expect(exportReviewFeedback([], prMeta)).toBe("# Code Review\n\nNo feedback provided.");
    expect(exportReviewFeedback([], null)).toBe("# Code Review\n\nNo feedback provided.");
    expect(exportReviewFeedback([])).toBe("# Code Review\n\nNo feedback provided.");
  });

  test("groups by file, sorts file comments before line comments, and sorts lines", () => {
    const result = exportReviewFeedback([
      annotation({ filePath: "b.ts", lineStart: 1, lineEnd: 1, text: "second" }),
      annotation({ filePath: "a.ts", lineStart: 20, lineEnd: 20, text: "later" }),
      annotation({ filePath: "a.ts", lineStart: 5, lineEnd: 5, text: "earlier" }),
      annotation({ filePath: "a.ts", scope: "file", text: "file comment" }),
    ]);

    expect(result).toContain("## a.ts");
    expect(result).toContain("## b.ts");
    expect(result.indexOf("File Comment")).toBeLessThan(result.indexOf("Line 5"));
    expect(result.indexOf("earlier")).toBeLessThan(result.indexOf("later"));
  });

  test("renders line ranges, side, reasoning, suggestions, conventional prefix, and token metadata", () => {
    const result = exportReviewFeedback([
      annotation({
        lineStart: 10,
        lineEnd: 15,
        side: "old",
        text: "Use safer query",
        reasoning: "Confirmed tenant id is missing",
        suggestedCode: "where tenant_id = $1",
        conventionalLabel: "issue",
        decorations: ["blocking"],
        tokenText: "db.query",
        charStart: 3,
        charEnd: 10,
      }),
    ]);

    expect(result).toContain("### Lines 10-15 (old) -- ``db.query`` (chars 3-10)");
    expect(result).toContain("**issue (blocking):** Use safer query");
    expect(result).toContain("**Reasoning:** Confirmed tenant id is missing");
    expect(result).toContain("**Suggested code:**");
    expect(result).toContain("where tenant_id = $1");
  });

  test("keeps exactly one top-level heading in local and PR modes", () => {
    expect(exportReviewFeedback([annotation()]).match(/^# /gm)).toHaveLength(1);
    expect(exportReviewFeedback([annotation()], prMeta).match(/^# /gm)).toHaveLength(1);
  });

  test("handles stacked review scopes without flattening mixed scopes", () => {
    const result = exportReviewFeedback([
      annotation({ diffScope: "layer", text: "layer finding" }),
      annotation({ filePath: "src/other.ts", diffScope: "full-stack", text: "full-stack finding" }),
    ], prMeta);

    expect(result).toContain("## Layer");
    expect(result).toContain("## Full-stack");
    expect(result).not.toContain("layer, full-stack");
    expect(result.indexOf("layer finding")).toBeGreaterThan(result.indexOf("## Layer"));
    expect(result.indexOf("layer finding")).toBeLessThan(result.indexOf("## Full-stack"));
    expect(result.indexOf("full-stack finding")).toBeGreaterThan(result.indexOf("## Full-stack"));
  });

  test("single PR scope is rendered in header and overrides prReviewScope only when annotation has scope", () => {
    const fromAnnotation = exportReviewFeedback([annotation({ diffScope: "layer" })], prMeta, undefined, "full-stack");
    expect(fromAnnotation).toContain("Review scope: layer");
    expect(fromAnnotation).not.toContain("Review scope: full-stack");

    const fromParam = exportReviewFeedback([annotation()], prMeta, undefined, "Full stack diff vs `main`");
    expect(fromParam).toContain("Review scope: Full stack diff vs `main`");
  });

  test("multi-PR grouping uses PR headings and deeper annotation headings", () => {
    const result = exportReviewFeedback([
      annotation({
        prUrl: "https://github.com/acme/widgets/pull/1",
        prNumber: 1,
        prTitle: "PR 1",
        prRepo: "acme/widgets",
        diffScope: "layer",
      }),
      annotation({
        prUrl: "https://github.com/acme/widgets/pull/2",
        prNumber: 2,
        prTitle: "PR 2",
        prRepo: "acme/widgets",
        filePath: "src/other.ts",
        diffScope: "full-stack",
      }),
    ]);

    expect(result).toContain("# Multi-PR Review");
    expect(result).toContain("## acme/widgets#1 -- PR 1");
    expect(result).toContain("## acme/widgets#2 -- PR 2");
    expect(result).toContain("### src/index.ts");
    expect(result).toContain("#### Line 10 (new)");
    expect(result).toContain("Review scope: layer");
    expect(result).toContain("Review scope: full-stack");
  });

  test("single annotation PR mismatched with provided PR metadata uses annotation PR context", () => {
    const result = exportReviewFeedback([
      annotation({
        prUrl: "https://github.com/acme/widgets/pull/42",
        prNumber: 42,
        prTitle: "fix: broken widget",
        prRepo: "acme/widgets",
      }),
    ], { ...prMeta, number: 99, url: "https://github.com/acme/widgets/pull/99", title: "different PR" });

    expect(result).not.toContain("#99");
    expect(result).toContain("#42");
    expect(result).not.toContain("Multi-PR");
    expect(result).toContain("fix: broken widget");
  });
});
