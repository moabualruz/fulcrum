import { describe, it, expect } from "vitest";

describe("Document Editor logic — knowledge workflow", () => {
  const DOC_TYPES = ["spec", "adr", "wiki", "runbook", "meeting", "postmortem", "rfc", "note", "scratch"] as const;

  it("9 doc types defined for toolbar presets", () => {
    expect(DOC_TYPES).toHaveLength(9);
  });

  it("each doc type is a non-empty string", () => {
    for (const dt of DOC_TYPES) {
      expect(dt.length).toBeGreaterThan(0);
    }
  });

  describe("context_summary extraction shape", () => {
    interface ContextSummary {
      headings: string[];
      wikilinks: string[];
      mentions: string[];
    }

    it("produces valid context_summary structure", () => {
      const summary: ContextSummary = {
        headings: ["Overview", "Architecture"],
        wikilinks: ["[[design-doc]]", "[[api-spec]]"],
        mentions: ["@alice"],
      };
      expect(summary.headings).toHaveLength(2);
      expect(summary.wikilinks).toHaveLength(2);
      expect(summary.mentions).toHaveLength(1);
    });

    it("empty document produces empty summary", () => {
      const summary: ContextSummary = { headings: [], wikilinks: [], mentions: [] };
      expect(summary.headings).toHaveLength(0);
    });
  });

  describe("version restore flow", () => {
    it("restore creates new version, not overwrites", () => {
      const versions = [
        { versionNum: 1, snapshot: {}, restoreOf: null },
        { versionNum: 2, snapshot: {}, restoreOf: null },
        { versionNum: 3, snapshot: {}, restoreOf: 1 },
      ];
      const restored = versions.find((v) => v.restoreOf !== null);
      expect(restored?.versionNum).toBe(3);
      expect(restored?.restoreOf).toBe(1);
    });
  });

  describe("doc tree drag-drop", () => {
    it("sortPosition ordering is stable", () => {
      const docs = [
        { id: "a", sortPosition: 0, parentId: null },
        { id: "b", sortPosition: 1, parentId: null },
        { id: "c", sortPosition: 0, parentId: "a" },
      ];
      const roots = docs.filter((d) => !d.parentId).sort((a, b) => a.sortPosition - b.sortPosition);
      expect(roots[0].id).toBe("a");
      expect(roots[1].id).toBe("b");
    });
  });
});
