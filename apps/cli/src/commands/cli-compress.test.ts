import { describe, expect, test } from "bun:test";

import {
  compressTargetIsCompressed,
  describeCompressPlan,
  parseCompressArgs,
  pendingTargets,
} from "./cli-compress.ts";

describe("cli-compress parser", () => {
  test("parses --check flag and ignores help flags as targets", () => {
    expect(parseCompressArgs(["--check", "docs/foo.md", "--help", "-h", "docs/bar.md"]))
      .toEqual({ checkMode: true, targets: ["docs/foo.md", "docs/bar.md"] });
  });

  test("default invocation has empty targets and no check mode", () => {
    expect(parseCompressArgs([])).toEqual({ checkMode: false, targets: [] });
  });
});

describe("cli-compress plan summary", () => {
  test("reports no targets when list is empty", () => {
    expect(describeCompressPlan({ checkMode: false, targets: [] }, [])).toBe("No targets to compress.");
  });

  test("distinguishes check mode from real compression in the summary", () => {
    expect(describeCompressPlan({ checkMode: true, targets: [] }, ["a.md", "b.md"]))
      .toBe("Would check 2 file(s).");
    expect(describeCompressPlan({ checkMode: false, targets: [] }, ["a.md", "b.md"]))
      .toBe("Compressing 2 file(s).");
  });
});

describe("idempotence helpers", () => {
  test("compressTargetIsCompressed detects .original.md siblings", () => {
    const siblings = new Set(["docs/a.original.md"]);
    expect(compressTargetIsCompressed("docs/a.md", siblings)).toBe(true);
    expect(compressTargetIsCompressed("docs/b.md", siblings)).toBe(false);
  });

  test("pendingTargets filters out already-compressed entries", () => {
    const siblings = new Set(["docs/a.original.md", "docs/c.original.md"]);
    const targets = ["docs/a.md", "docs/b.md", "docs/c.md"];
    expect(pendingTargets(targets, siblings)).toEqual(["docs/b.md"]);
  });
});
