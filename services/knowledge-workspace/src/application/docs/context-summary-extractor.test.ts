/**
 * Tests for ContextSummaryExtractor
 * Defines expected extraction behavior.
 */

import { describe, it, expect } from "bun:test";
import { ContextSummaryExtractor } from "./context-summary-extractor.ts";

const extractor = new ContextSummaryExtractor();

describe("ContextSummaryExtractor", () => {
  it("Test 1: extracts headings from markdown", () => {
    const result = extractor.extractSummary("# Heading\n## Sub");
    expect(result.headings).toEqual(["Heading", "Sub"]);
  });

  it("Test 2: extracts wikilinks from markdown", () => {
    const result = extractor.extractSummary("see [[PageA]] and [[PageB]]");
    expect(result.wikilinks).toEqual(["PageA", "PageB"]);
  });

  it("Test 3: extracts mentions from markdown", () => {
    const result = extractor.extractSummary("assigned to @alice and @bob");
    expect(result.mentions).toEqual(["alice", "bob"]);
  });

  it("Test 4: empty string returns empty arrays", () => {
    const result = extractor.extractSummary("");
    expect(result).toEqual({ headings: [], wikilinks: [], mentions: [] });
  });

  it("Test 5: combined markdown extracts all three simultaneously", () => {
    const md = "# Project Notes\n\nSee [[Architecture]] and [[API Design]].\nAssigned to @alice.\n\n## Next Steps\n\nPing @bob about [[Roadmap]].";
    const result = extractor.extractSummary(md);
    expect(result.headings).toEqual(["Project Notes", "Next Steps"]);
    expect(result.wikilinks).toEqual(["Architecture", "API Design", "Roadmap"]);
    expect(result.mentions).toEqual(["alice", "bob"]);
  });
});
