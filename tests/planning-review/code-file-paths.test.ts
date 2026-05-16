import { describe, expect, test } from "bun:test";
import {
  CODE_PATH_BARE_REGEX,
  isCodeFilePath,
  isCodeFilePathStrict,
  isPlausibleCodeFilePath,
  parseCodePath,
  stripLineRef,
} from "@planning-review/application/reviews/shared/code-file-paths.ts";
import { extractCandidateCodePaths } from "@planning-review/application/reviews/shared/extract-code-paths.ts";

describe("review planning behavior behavior", () => {
  test("detects common code files, special filenames, directories, and line references", () => {
    expect(isCodeFilePath("button.tsx")).toBe(true);
    expect(isCodeFilePath("main.py")).toBe(true);
    expect(isCodeFilePath("lib.rs")).toBe(true);
    expect(isCodeFilePath("config.json")).toBe(true);
    expect(isCodeFilePath("services/platform-core/src/application/component-lifecycle/Button.tsx")).toBe(true);
    expect(isCodeFilePath("./utils/helpers.ts")).toBe(true);
    expect(isCodeFilePath("../lib/main.py")).toBe(true);
    expect(isCodeFilePath("Dockerfile")).toBe(true);
    expect(isCodeFilePath("path/to/Makefile")).toBe(true);
    expect(isCodeFilePath("src/foo.ts#L42")).toBe(true);
    expect(isCodeFilePath("src/foo.ts:7-9")).toBe(true);
  });

  test("rejects URLs, non-code files, prose, shell expansions, globs, and whitespace", () => {
    expect(isCodeFilePath("https://github.com/foo.ts")).toBe(false);
    expect(isCodeFilePath("http://example.com/main.py")).toBe(false);
    expect(isCodeFilePath(".env")).toBe(false);
    expect(isCodeFilePath("readme.txt")).toBe(false);
    expect(isCodeFilePath("npm install")).toBe(false);
    expect(isPlausibleCodeFilePath("packages/ui/{a,b,c}.ts")).toBe(false);
    expect(isPlausibleCodeFilePath("src/*.ts")).toBe(false);
    expect(isPlausibleCodeFilePath("src/foo?.ts")).toBe(false);
    expect(isPlausibleCodeFilePath("path with space.ts")).toBe(false);
  });

  test("strict detection requires a directory separator and still rejects URLs", () => {
    expect(isCodeFilePathStrict("button.tsx")).toBe(false);
    expect(isCodeFilePathStrict("Dockerfile")).toBe(false);
    expect(isCodeFilePathStrict("package.json")).toBe(false);
    expect(isCodeFilePathStrict("services/platform-core/src/application/component-lifecycle/Button.tsx")).toBe(true);
    expect(isCodeFilePathStrict("./utils/helpers.ts")).toBe(true);
    expect(isCodeFilePathStrict("../lib/main.py")).toBe(true);
    expect(isCodeFilePathStrict("https://github.com/foo.ts")).toBe(false);
    expect(isCodeFilePathStrict("path/to/readme.txt")).toBe(false);
  });

  test("parses and strips line suffixes while normalizing reversed ranges", () => {
    expect(parseCodePath("src/foo.ts")).toEqual({ filePath: "src/foo.ts" });
    expect(parseCodePath("src/foo.ts:12")).toEqual({ filePath: "src/foo.ts", line: 12 });
    expect(parseCodePath("src/foo.ts:9-4")).toEqual({ filePath: "src/foo.ts", line: 4, lineEnd: 9 });
    expect(stripLineRef("src/foo.ts:12-20")).toBe("src/foo.ts");
    expect(stripLineRef("src/foo.ts#L42")).toBe("src/foo.ts");
  });

  test("bare regex finds abbreviated and dynamic-route paths", () => {
    const re = new RegExp(CODE_PATH_BARE_REGEX.source, "g");
    expect("see editor/App.tsx for details".match(re)).toContain("editor/App.tsx");
    expect("visit app/[slug]/page.tsx".match(re)).toContain("app/[slug]/page.tsx");
  });

  test("extracts, dedupes, and cleans code paths from markdown like plan review renderer", () => {
    const md = [
      "Open `packages/editor/App.tsx` and editor/App.tsx.",
      "Also review `src/foo.ts#L42` and review-editor/App.tsx.",
      "```ts",
      "import ignored from 'src/ignored.ts';",
      "```",
      "<!-- src/commented.ts -->",
    ].join("\n");

    expect(extractCandidateCodePaths(md)).toEqual([
      "packages/editor/App.tsx",
      "src/foo.ts",
      "editor/App.tsx",
      "review-editor/App.tsx",
    ]);
  });

  test("does not leak URL-shaped substrings or implausible shell paths", () => {
    expect(extractCandidateCodePaths("see https://github.com/foo/bar.ts in docs")).toEqual([]);
    expect(extractCandidateCodePaths("see https://en.wikipedia.org/wiki/Foo_(bar).ts in docs")).toEqual([]);
    expect(extractCandidateCodePaths("files in packages/ui/{a,b}.ts")).toEqual([]);

    const out = extractCandidateCodePaths("https://github.com/example.com docs and editor/App.tsx");
    expect(out).toContain("editor/App.tsx");
  });
});
