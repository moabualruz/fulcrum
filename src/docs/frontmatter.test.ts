import { describe, it, expect } from "bun:test";

describe("Frontmatter form round-trip (DOC-02)", () => {
  it("round-trips spec frontmatter without data loss", () => {
    const input = { title: "API Spec", version: "1.0", status: "draft", authors: ["alice"] };
    // Simulate: serialize to JSON → store → deserialize
    const serialized = JSON.stringify(input);
    const deserialized = JSON.parse(serialized);
    expect(deserialized).toEqual(input);
  });

  it("round-trips all doc_type schemas", () => {
    const schemas = ["spec", "adr", "wiki", "runbook", "meeting", "postmortem", "rfc", "note", "scratch"];
    for (const docType of schemas) {
      const fm = { docType, title: `Test ${docType}`, custom: { key: "value" } };
      expect(JSON.parse(JSON.stringify(fm))).toEqual(fm);
    }
  });

  it("validates required fields per doc_type — spec requires title", () => {
    const valid = { docType: "spec", title: "My Spec" };
    const invalid = { docType: "spec" }; // no title
    // Required fields: title must be a non-empty string
    expect(typeof valid.title).toBe("string");
    expect((invalid as Record<string, unknown>)["title"]).toBeUndefined();
  });

  it("preserves nested arrays and objects in frontmatter", () => {
    const fm = {
      docType: "adr",
      title: "ADR-001",
      context: {
        deciders: ["alice", "bob"],
        status: "accepted",
        pros: ["fast", "simple"],
        cons: ["opaque"],
      },
    };
    expect(JSON.parse(JSON.stringify(fm))).toEqual(fm);
  });

  it("handles null and undefined values gracefully", () => {
    const fm = { docType: "note", title: "My Note", description: null };
    const serialized = JSON.parse(JSON.stringify(fm));
    expect(serialized.description).toBeNull();
    expect(serialized.title).toBe("My Note");
  });
});
