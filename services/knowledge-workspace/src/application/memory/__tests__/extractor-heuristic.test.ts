import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { HeuristicExtractor } from "../extractor-heuristic.ts";
import { MemoryRepository } from "@knowledge-workspace/infrastructure/database/repositories/memory/MemoryRepository.ts";

describe("HeuristicExtractor", () => {
  test("resolves through needle-di", () => {
    const container = null;
    container.bind({
      provide: MemoryRepository,
      useValue: {} as MemoryRepository,
    });

    const extractor = container.get(HeuristicExtractor);

    expect(extractor).toBeInstanceOf(HeuristicExtractor);
  });

  test("returns no memories for empty input", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);

    expect(extractor.extractMemories("")).toEqual([]);
  });

  test("extracts file references from touched-file transcript lines", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);

    const rows = extractor.extractMemories("Agent [wrote] src/foo.ts");

    expect(rows).toContainEqual(
      expect.objectContaining({
        kind: "file_ref",
        body: "src/foo.ts",
        source: "heuristic",
      }),
    );
  });

  test("extracts five decision variants as high-importance decisions", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);
    const text = [
      "decided: use PGlite",
      "decision: keep local-first defaults",
      "Decision - ship heuristic extraction always-on",
      "DECIDED: gate LLM extraction",
      "## Decision",
      "Use deterministic FTS retrieval",
    ].join("\n");

    const decisions = extractor.extractMemories(text)
      .filter((row) => row.kind === "decision");

    expect(decisions).toHaveLength(5);
    expect(decisions.map((row) => row.body)).toEqual([
      "use PGlite",
      "keep local-first defaults",
      "ship heuristic extraction always-on",
      "gate LLM extraction",
      "Use deterministic FTS retrieval",
    ]);
    expect(decisions.every((row) => row.importance === "high")).toBe(true);
    expect(decisions.every((row) => row.source === "heuristic")).toBe(true);
  });

  test("extracts H2 and H3 headings as section anchors", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);

    const rows = extractor.extractMemories("## Summary\nbody\n### Details");

    expect(rows.filter((row) => row.kind === "section_anchor").map((row) => row.body))
      .toEqual(["Summary", "Details"]);
  });

  test("extracts blocker patterns as high-importance blockers", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);

    const blockers = extractor.extractMemories(
      "blocked by issue #12\nwaiting on review\nneed schema migration to proceed",
    ).filter((row) => row.kind === "blocker");

    expect(blockers.map((row) => row.body)).toEqual([
      "blocked by issue #12",
      "waiting on review",
      "need schema migration to proceed",
    ]);
    expect(blockers.every((row) => row.importance === "high")).toBe(true);
  });

  test("extracts wikilinks and bare URLs as links", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);

    const links = extractor.extractMemories(
      "See [[Foo Bar]] and https://example.com/docs?q=1.",
    ).filter((row) => row.kind === "link");

    expect(links.map((row) => row.body)).toEqual([
      "Foo Bar",
      "https://example.com/docs?q=1",
    ]);
  });

  test("extracts at least one row of each kind from a mixed transcript", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);
    const rows = extractor.extractMemories([
      "[read] services/knowledge-workspace/src/application/memory/extractor-heuristic.ts",
      "decided: keep extraction side-effect free",
      "## Summary",
      "blocked by issue #12",
      "See [[Memory Design]] and https://example.com/memory-design",
    ].join("\n"));

    expect(new Set(rows.map((row) => row.kind))).toEqual(
      new Set(["file_ref", "decision", "section_anchor", "blocker", "link"]),
    );
  });

  test("does not extract cross-pass duplicates for the same span", () => {
    const extractor = new HeuristicExtractor({} as MemoryRepository);
    const rows = extractor.extractMemories("## Decision\nuse PGlite");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      kind: "decision",
      body: "use PGlite",
    }));
  });

  test("extractMemories is deterministic and does not write through repository", () => {
    let writes = 0;
    const repo = new Proxy({}, {
      get() {
        writes += 1;
        throw new Error("repository should not be used");
      },
    }) as MemoryRepository;
    const extractor = new HeuristicExtractor(repo);
    const text = "[created] docs/memory.md\nwaiting on review";

    const first = extractor.extractMemories(text);
    const second = extractor.extractMemories(text);

    expect(first).toEqual(second);
    expect(writes).toBe(0);
  });
});
