import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { DocumentFormSchema } from "./documents.schema.ts";

describe("DocumentFormSchema", () => {
  test("happy path parses required fields + optional defaults", () => {
    const out = v.parse(DocumentFormSchema, {
      title: "Hello",
      kind: "spec",
      body: "# Hello\n",
    });
    expect(out.title).toBe("Hello");
    expect(out.kind).toBe("spec");
    expect(out.body).toBe("# Hello\n");
    expect(out.labels).toBe("");
    expect(out.projectId === undefined || out.projectId === null).toBe(true);
  });

  test("title is trimmed before validation", () => {
    const out = v.parse(DocumentFormSchema, {
      title: "  Trim me  ",
      kind: "note",
      body: "",
    });
    expect(out.title).toBe("Trim me");
  });

  test("empty title fails minLength(1)", () => {
    expect(() =>
      v.parse(DocumentFormSchema, { title: "", kind: "note", body: "" }),
    ).toThrow();
  });

  test("missing kind fails", () => {
    expect(() =>
      v.parse(DocumentFormSchema, { title: "Hi", kind: "", body: "" }),
    ).toThrow();
  });

  test("labels accepts comma-separated input string", () => {
    const out = v.parse(DocumentFormSchema, {
      title: "Hi",
      kind: "note",
      body: "",
      labels: "a, b, c",
    });
    expect(out.labels).toBe("a, b, c");
  });
});
