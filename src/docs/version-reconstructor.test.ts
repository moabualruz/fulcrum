/**
 * Tests for applyDelta() in version-reconstructor.ts
 * TDD RED phase — these tests define expected behavior before implementation.
 */

import { describe, it, expect } from "bun:test";
import { Schema } from "@tiptap/pm/model";
import { TRPCError } from "@trpc/server";

// We test applyDelta via reconstructDocVersion's internal logic.
// Export applyDelta for testing.
import { applyDelta } from "./version-reconstructor.ts";

// Minimal ProseMirror schema for testing
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
  },
  marks: {},
});

const baseDoc = schema.node("doc", null, [
  schema.node("paragraph", null, [schema.text("Hello")]),
]).toJSON() as Record<string, unknown>;

describe("applyDelta", () => {
  it("Test 1: legacy full-snapshot op (path=[], value={...}) returns snapshot value", () => {
    const delta = {
      ops: [{ path: [], value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "World" }] }] } }],
    };
    const result = applyDelta(baseDoc, delta, schema);
    expect(result).toEqual(delta.ops[0].value);
  });

  it("Test 2: delta with steps format reconstructs doc from base + steps", () => {
    // Build a real ProseMirror step JSON: replace text
    const doc = schema.nodeFromJSON(baseDoc);
    const { Transform } = require("@tiptap/pm/transform");
    const tr = new Transform(doc);
    tr.replaceWith(1, 6, schema.text("World")); // replace "Hello" with "World"
    const stepsJson = tr.steps.map((s: any) => s.toJSON());

    const delta = { steps: stepsJson };
    const result = applyDelta(baseDoc, delta, schema);
    expect(result).toBeTruthy();
    const resultDoc = schema.nodeFromJSON(result);
    expect(resultDoc.textContent).toBe("World");
  });

  it("Test 3: applyDelta with multiple steps applies all sequentially", () => {
    const { Transform } = require("@tiptap/pm/transform");
    const doc = schema.nodeFromJSON(baseDoc);
    const tr1 = new Transform(doc);
    tr1.replaceWith(1, 6, schema.text("World"));
    const doc2 = tr1.doc;
    const tr2 = new Transform(doc2);
    tr2.replaceWith(1, 6, schema.text("Final"));
    const stepsJson = [...tr1.steps, ...tr2.steps].map((s: any) => s.toJSON());

    const delta = { steps: stepsJson };
    const result = applyDelta(baseDoc, delta, schema);
    const resultDoc = schema.nodeFromJSON(result);
    expect(resultDoc.textContent).toBe("Final");
  });

  it("Test 4: applyDelta with null delta throws TRPCError", () => {
    expect(() => applyDelta(baseDoc, null, schema)).toThrow(TRPCError);
  });

  it("Test 5: applyDelta with empty steps array throws TRPCError", () => {
    const delta = { steps: [] };
    expect(() => applyDelta(baseDoc, delta, schema)).toThrow(TRPCError);
  });
});
