import { describe, it, expect } from "vitest";
import { OramaIndex } from "../../src/lib/search/OramaIndex.js";

describe("OramaIndex — Phase 06", () => {
  it("exports OramaIndex class", () => {
    expect(OramaIndex).toBeDefined();
    expect(typeof OramaIndex).toBe("function");
  });

  it("build() creates index from doc array", async () => {
    const idx = new OramaIndex();
    await idx.build([
      { id: "1", title: "Login fix", body: "Fixed auth bug", kind: "task", project: "alpha", status: "done", updatedAt: Date.now() },
      { id: "2", title: "API docs", body: "REST endpoints", kind: "doc", project: "alpha", status: "published", updatedAt: Date.now() },
    ]);
    const results = await idx.search("login");
    expect(results.hits.length).toBeGreaterThan(0);
    expect(results.hits[0].document.title).toContain("Login");
  });

  it("search returns empty for no match", async () => {
    const idx = new OramaIndex();
    await idx.build([
      { id: "1", title: "Hello", body: "world", kind: "doc", project: "p1", status: "ok", updatedAt: Date.now() },
    ]);
    const results = await idx.search("zzzznonexistent");
    expect(results.hits.length).toBe(0);
  });

  it("facet search returns kind counts", async () => {
    const idx = new OramaIndex();
    await idx.build([
      { id: "1", title: "Task A", body: "text", kind: "task", project: "p1", status: "open", updatedAt: Date.now() },
      { id: "2", title: "Task B", body: "text", kind: "task", project: "p1", status: "open", updatedAt: Date.now() },
      { id: "3", title: "Doc C", body: "text", kind: "doc", project: "p1", status: "ok", updatedAt: Date.now() },
    ]);
    const results = await idx.search("text", { facets: true });
    expect(results.facets).toBeDefined();
  });

  it("serialize and hydrate round-trips", async () => {
    const idx = new OramaIndex();
    await idx.build([
      { id: "1", title: "Roundtrip", body: "test", kind: "task", project: "p1", status: "done", updatedAt: Date.now() },
    ]);
    const snapshot = await idx.serialize();
    expect(snapshot).toBeDefined();

    const idx2 = new OramaIndex();
    await idx2.hydrate(snapshot);
    const results = await idx2.search("Roundtrip");
    expect(results.hits.length).toBe(1);
  });
});
