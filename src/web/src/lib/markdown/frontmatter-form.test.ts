import { describe, expect, test } from "bun:test";
import {
  readFrontmatterForm,
  writeFrontmatterForm,
  type FrontmatterFormDoc,
} from "./frontmatter-form.ts";

describe("readFrontmatterForm", () => {
  test("empty input gives defaults", () => {
    expect(readFrontmatterForm("")).toEqual({
      values: { title: "", kind: "", labels: [] },
      body: "",
      rawFrontmatter: {},
    });
  });

  test("body-only input keeps body, defaults values", () => {
    expect(readFrontmatterForm("hello\n")).toEqual({
      values: { title: "", kind: "", labels: [] },
      body: "hello\n",
      rawFrontmatter: {},
    });
  });

  test("frontmatter-only with title/kind/labels populates values", () => {
    const input = "---\ntitle: T\nkind: spec\nlabels:\n  - a\n  - b\n---\n\nhello\n";
    const doc = readFrontmatterForm(input);
    expect(doc.values).toEqual({ title: "T", kind: "spec", labels: ["a", "b"] });
    expect(doc.body).toBe("\nhello\n");
    expect(doc.rawFrontmatter).toEqual({});
  });

  test("extra frontmatter keys land in rawFrontmatter", () => {
    const input =
      "---\ntitle: T\nkind: spec\nid: 01J123\nstatus: accepted\n---\nbody\n";
    const doc = readFrontmatterForm(input);
    expect(doc.values.title).toBe("T");
    expect(doc.values.kind).toBe("spec");
    expect(doc.rawFrontmatter).toEqual({ id: "01J123", status: "accepted" });
  });

  test("non-array labels are dropped from both values and raw", () => {
    const input = "---\ntitle: T\nlabels: not-array\n---\nbody\n";
    const doc = readFrontmatterForm(input);
    expect(doc.values.labels).toEqual([]);
    expect(doc.rawFrontmatter).not.toHaveProperty("labels");
  });
});

describe("writeFrontmatterForm", () => {
  test("empty values + empty raw produces no frontmatter block", () => {
    const out = writeFrontmatterForm({
      values: { title: "", kind: "", labels: [] },
      body: "hello\n",
      rawFrontmatter: {},
    });
    expect(out).toBe("hello\n");
    expect(out.startsWith("---")).toBe(false);
  });

  test("rawFrontmatter without values still emits frontmatter block", () => {
    const out = writeFrontmatterForm({
      values: { title: "", kind: "", labels: [] },
      body: "body\n",
      rawFrontmatter: { id: "X" },
    });
    expect(out).toContain("---\n");
    expect(out).toContain("id: X");
    expect(out).not.toContain("title:");
    expect(out).not.toContain("kind:");
    expect(out).not.toContain("labels:");
  });

  test("single-item labels serialize as YAML list", () => {
    const out = writeFrontmatterForm({
      values: { title: "T", kind: "spec", labels: ["one"] },
      body: "body\n",
      rawFrontmatter: {},
    });
    expect(out).toContain("title: T");
    expect(out).toContain("kind: spec");
    expect(out).toContain("labels:\n  - one");
  });

  test("round-trip preserves values and body", () => {
    const doc: FrontmatterFormDoc = {
      values: { title: "Hello", kind: "spec", labels: ["a", "b"] },
      body: "\nbody line\n",
      rawFrontmatter: { id: "01J", status: "accepted" },
    };
    const round = readFrontmatterForm(writeFrontmatterForm(doc));
    expect(round.values).toEqual(doc.values);
    expect(round.body).toBe(doc.body);
  });
});
