import { describe, expect, test } from "bun:test";
import {
  findReviewSearchMatches,
  getReviewSearchSideLabel,
  groupReviewSearchMatches,
  type ReviewSearchableDiffFile,
} from "@planning-review/application/reviews/shared/review-search.ts";

const diffFiles: ReviewSearchableDiffFile[] = [
  {
    path: "src/alpha.ts",
    patch: [
      "diff --git a/src/alpha.ts b/src/alpha.ts",
      "index 1111111..2222222 100644",
      "--- a/src/alpha.ts",
      "+++ b/src/alpha.ts",
      "@@ -10,3 +10,4 @@ export function alpha() {",
      "-  const searchTerm = oldValue;",
      "+  const searchTerm = newValue;",
      "   return searchTerm;",
      "+  console.log(searchTerm);",
      " }",
    ].join("\n"),
    additions: 2,
    deletions: 1,
  },
  {
    path: "src/beta.ts",
    patch: [
      "diff --git a/src/beta.ts b/src/beta.ts",
      "index 3333333..4444444 100644",
      "--- a/src/beta.ts",
      "+++ b/src/beta.ts",
      "@@ -1,2 +1,2 @@",
      '-export const beta = () => "before";',
      '+export const beta = () => "searchTerm";',
    ].join("\n"),
    additions: 1,
    deletions: 1,
  },
];

describe("review planning behavior behavior", () => {
  test("returns no matches for empty queries", () => {
    expect(findReviewSearchMatches(diffFiles, "")).toEqual([]);
    expect(findReviewSearchMatches(diffFiles, "   ")).toEqual([]);
  });

  test("finds matches across multiple files and diff sides", () => {
    const matches = findReviewSearchMatches(diffFiles, "searchterm");

    expect(matches).toHaveLength(5);
    expect(matches.map((match) => [match.filePath, match.side, match.lineNumber])).toEqual([
      ["src/alpha.ts", "deletion", 10],
      ["src/alpha.ts", "addition", 10],
      ["src/alpha.ts", "context", 11],
      ["src/alpha.ts", "addition", 12],
      ["src/beta.ts", "addition", 1],
    ]);
  });

  test("matches case-insensitively and keeps snippet context", () => {
    const [match] = findReviewSearchMatches(diffFiles, "SEARCHTERM");

    expect(match).toBeDefined();
    expect(match?.text).toContain("searchTerm");
    expect(match?.snippet).toContain("searchTerm");
  });

  test("preserves both new and old line numbers for context matches", () => {
    const contextMatch = findReviewSearchMatches(diffFiles, "return").find((match) => match.side === "context");

    expect(contextMatch).toBeDefined();
    expect(contextMatch?.lineNumber).toBe(11);
    expect(contextMatch?.altLineNumber).toBe(11);
  });

  test("groups matches by file in original file order", () => {
    const matches = findReviewSearchMatches(diffFiles, "searchterm");
    const groups = groupReviewSearchMatches(diffFiles, matches);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => [group.filePath, group.fileIndex, group.matches.length])).toEqual([
      ["src/alpha.ts", 0, 4],
      ["src/beta.ts", 1, 1],
    ]);
  });

  test("finds multiple matches on one line with stable ids", () => {
    const matches = findReviewSearchMatches([
      {
        path: "src/repeat.ts",
        patch: "@@ -1 +1 @@\n+search search search",
        additions: 1,
        deletions: 0,
      },
    ], "search");

    expect(matches.map((match) => match.matchStart)).toEqual([0, 7, 14]);
    expect(matches.map((match) => match.id)).toEqual([
      "src/repeat.ts:addition:1:0:0",
      "src/repeat.ts:addition:1:7:1",
      "src/repeat.ts:addition:1:14:2",
    ]);
  });

  test("returns short labels for diff sides", () => {
    expect(getReviewSearchSideLabel("addition")).toBe("new");
    expect(getReviewSearchSideLabel("deletion")).toBe("old");
    expect(getReviewSearchSideLabel("context")).toBe("ctx");
  });
});
