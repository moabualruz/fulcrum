import { describe, expect, test } from "bun:test";
import {
  createAnnotationStore,
  HEARTBEAT_COMMENT,
  HEARTBEAT_INTERVAL_MS,
  serializeSSEEvent,
  transformPlanInput,
  transformReviewInput,
  type ExternalAnnotationEvent,
  type StorableAnnotation,
} from "@planning-review/application/reviews/shared/external-annotations.ts";

describe("review planning behavior behavior", () => {
  test("serializes SSE events and exposes plan review heartbeat constants", () => {
    expect(HEARTBEAT_COMMENT).toBe(":\n\n");
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);

    const event: ExternalAnnotationEvent<{ id: string }> = {
      type: "add",
      annotations: [{ id: "ann-1" }],
    };
    expect(serializeSSEEvent(event)).toBe('data: {"type":"add","annotations":[{"id":"ann-1"}]}\n\n');
  });

  test("transforms single and batch plan annotation inputs with defaults", () => {
    const single = transformPlanInput({
      source: "qa-agent",
      text: "Clarify success criteria",
      author: "QA",
    });
    expect("error" in single).toBe(false);
    if (!("error" in single)) {
      expect(single.annotations).toHaveLength(1);
      expect(single.annotations[0]).toMatchObject({
        blockId: "external",
        startOffset: 0,
        endOffset: 0,
        type: "GLOBAL_COMMENT",
        text: "Clarify success criteria",
        originalText: "",
        author: "QA",
        source: "qa-agent",
      });
      expect(single.annotations[0]?.id).toBeString();
      expect(single.annotations[0]?.createdA).toBeNumber();
    }

    const batch = transformPlanInput({
      annotations: [
        { source: "reviewer", type: "COMMENT", originalText: "old", text: "change this" },
        { source: "reviewer", type: "DELETION", originalText: "remove me", text: "delete" },
      ],
    });
    expect("error" in batch).toBe(false);
    if (!("error" in batch)) {
      expect(batch.annotations.map((annotation) => annotation.type)).toEqual(["COMMENT", "DELETION"]);
    }
  });

  test("rejects invalid plan annotation bodies like plan review", () => {
    expect(transformPlanInput(null)).toEqual({ error: "Request body must be a JSON object" });
    expect(transformPlanInput({ annotations: [] })).toEqual({ error: "annotations array must not be empty" });
    expect(transformPlanInput({ source: "agent" })).toEqual({
      error: 'annotations[0] missing required "text" field',
    });
    expect(transformPlanInput({ source: "agent", text: "x", type: "BAD" })).toEqual({
      error: 'annotations[0] invalid type "BAD". Must be one of: DELETION, COMMENT, GLOBAL_COMMENT',
    });
    expect(transformPlanInput({ source: "agent", text: "x", type: "COMMENT" })).toEqual({
      error: 'annotations[0] COMMENT requires non-empty "originalText" field. Use GLOBAL_COMMENT for sidebar-only feedback.',
    });
    expect(transformPlanInput({ source: "agent", text: "x", type: "DELETION" })).toEqual({
      error: 'annotations[0] DELETION type requires non-empty "originalText" field',
    });
  });

  test("transforms review annotation inputs with defaults and optional agent metadata", () => {
    const result = transformReviewInput({
      source: "security-review",
      filePath: "src/auth.ts",
      lineStart: 10,
      lineEnd: 12,
      text: "Missing authorization check",
      severity: "important",
      reasoning: "Confirmed route lacks tenant guard",
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0]).toMatchObject({
        type: "comment",
        scope: "line",
        filePath: "src/auth.ts",
        lineStart: 10,
        lineEnd: 12,
        side: "new",
        text: "Missing authorization check",
        severity: "important",
        reasoning: "Confirmed route lacks tenant guard",
        source: "security-review",
      });
      expect(result.annotations[0]?.id).toBeString();
      expect(result.annotations[0]?.createdAt).toBeNumber();
    }
  });

  test("rejects invalid review annotation bodies like plan review", () => {
    expect(transformReviewInput({ source: "agent", text: "x" })).toEqual({
      error: 'annotations[0] missing required "filePath" field',
    });
    expect(transformReviewInput({ source: "agent", filePath: "src/a.ts", lineEnd: 1, text: "x" })).toEqual({
      error: 'annotations[0] missing required "lineStart" field',
    });
    expect(transformReviewInput({ source: "agent", filePath: "src/a.ts", lineStart: 1, text: "x" })).toEqual({
      error: 'annotations[0] missing required "lineEnd" field',
    });
    expect(transformReviewInput({
      source: "agent",
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 1,
      side: "both",
      text: "x",
    })).toEqual({ error: 'annotations[0] invalid side "both". Must be one of: old, new' });
    expect(transformReviewInput({
      source: "agent",
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 1,
      type: "delete",
      text: "x",
    })).toEqual({ error: 'annotations[0] invalid type "delete". Must be one of: comment, suggestion, concern' });
    expect(transformReviewInput({
      source: "agent",
      filePath: "src/a.ts",
      lineStart: 1,
      lineEnd: 1,
    })).toEqual({ error: "annotations[0] must have at least one of: text, suggestedCode" });
  });

  test("annotation store mutates snapshots, versions, source clears, updates, and listener events", () => {
    const store = createAnnotationStore<StorableAnnotation & { text?: string }>();
    const events: ExternalAnnotationEvent<StorableAnnotation & { text?: string }>[] = [];
    const unsubscribe = store.onMutation((event) => events.push(event));

    expect(store.version).toBe(0);
    expect(store.add([{ id: "a", source: "one", text: "A" }, { id: "b", source: "two", text: "B" }])).toHaveLength(2);
    expect(store.version).toBe(1);
    expect(store.getAll().map((annotation) => annotation.id)).toEqual(["a", "b"]);

    expect(store.update("a", { text: "A2" })).toMatchObject({ id: "a", text: "A2" });
    expect(store.update("missing", { text: "x" })).toBeNull();
    expect(store.clearBySource("two")).toBe(1);
    expect(store.remove("a")).toBe(true);
    expect(store.clearAll()).toBe(0);
    unsubscribe();

    expect(events.map((event) => event.type)).toEqual(["add", "update", "clear", "remove"]);
    expect(events[2]).toEqual({ type: "clear", source: "two" });
  });
});
