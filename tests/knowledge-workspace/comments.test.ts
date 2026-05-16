import { describe, expect, test } from "bun:test";

import {
  canDeleteDocumentComment,
  parseDocumentCommentContent,
  prepareDocumentCommentCreate,
  prepareDocumentCommentUpdate,
} from "@knowledge-workspace/domain/document-comments.ts";

describe("document workspace comment behavior", () => {
  test("prepares top-level page comments with parsed JSON, truncated selection, watcher and notification jobs", () => {
    const prepared = prepareDocumentCommentCreate({
      page: { id: "page-1", spaceId: "space-1" },
      workspaceId: "workspace-1",
      user: { id: "user-1" },
      input: {
        content: JSON.stringify({ type: "doc", content: [{ type: "text", text: "hello" }] }),
        selection: "x".repeat(300),
      },
    });

    expect(prepared.insert).toMatchObject({
      pageId: "page-1",
      creatorId: "user-1",
      workspaceId: "workspace-1",
      spaceId: "space-1",
      type: "page",
      parentCommentId: undefined,
    });
    expect(prepared.insert.selection).toHaveLength(250);
    expect(prepared.addPageWatchersJob).toEqual({
      userIds: ["user-1"],
      pageId: "page-1",
      spaceId: "space-1",
      workspaceId: "workspace-1",
    });
    expect(prepared.notificationJob).toEqual({
      commentId: undefined,
      parentCommentId: undefined,
      pageId: "page-1",
      spaceId: "space-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      mentionedUserIds: [],
      notifyWatchers: true,
    });
    expect(prepared.commentEvent.operation).toBe("commentCreated");
  });

  test("validates reply parent page and forbids replying to replies like the source behavior", () => {
    expect(() => prepareDocumentCommentCreate({
      page: { id: "page-1", spaceId: "space-1" },
      workspaceId: "workspace-1",
      user: { id: "user-1" },
      input: {
        content: "{}",
        parentCommentId: "parent-1",
      },
      parentComment: { id: "parent-1", pageId: "page-2", parentCommentId: null },
    })).toThrow("Parent comment not found");

    expect(() => prepareDocumentCommentCreate({
      page: { id: "page-1", spaceId: "space-1" },
      workspaceId: "workspace-1",
      user: { id: "user-1" },
      input: {
        content: "{}",
        parentCommentId: "reply-1",
      },
      parentComment: { id: "reply-1", pageId: "page-1", parentCommentId: "parent-1" },
    })).toThrow("You cannot reply to a reply");
  });

  test("builds Yjs comment mark request only for valid selections", () => {
    const valid = prepareDocumentCommentCreate({
      page: { id: "page-1", spaceId: "space-1" },
      workspaceId: "workspace-1",
      user: { id: "user-1", name: "Ada" },
      input: {
        content: "{}",
        yjsSelection: {
          anchor: { type: { client: 1, clock: 2 }, tname: null, item: null, assoc: 0 },
          head: { type: { client: 1, clock: 3 }, tname: null, item: null, assoc: 0 },
        },
      },
      insertedCommentId: "comment-1",
    });
    expect(valid.yjsMarkRequest).toEqual({
      documentName: "page.page-1",
      payload: {
        yjsSelection: valid.input.yjsSelection,
        commentId: "comment-1",
        resolved: false,
        user: { id: "user-1", name: "Ada" },
      },
    });

    const invalid = prepareDocumentCommentCreate({
      page: { id: "page-1", spaceId: "space-1" },
      workspaceId: "workspace-1",
      user: { id: "user-1" },
      input: { content: "{}", yjsSelection: { anchor: {}, head: {} } },
      insertedCommentId: "comment-1",
    });
    expect(invalid.yjsMarkRequest).toBeUndefined();
    expect(invalid.warnings[0]).toContain("Invalid yjsSelection");
  });

  test("updates only the creator comment and emits update metadata", () => {
    const updated = prepareDocumentCommentUpdate({
      now: new Date("2026-05-13T10:00:00.000Z"),
      authUser: { id: "user-1" },
      comment: {
        id: "comment-1",
        creatorId: "user-1",
        pageId: "page-1",
        spaceId: "space-1",
        workspaceId: "workspace-1",
        content: { old: true },
      },
      input: { content: JSON.stringify({ new: true }) },
    });

    expect(updated.update).toEqual({
      content: { new: true },
      editedAt: new Date("2026-05-13T10:00:00.000Z"),
      updatedAt: new Date("2026-05-13T10:00:00.000Z"),
    });
    expect(updated.commentEvent.operation).toBe("commentUpdated");

    expect(() => prepareDocumentCommentUpdate({
      authUser: { id: "user-2" },
      comment: {
        id: "comment-1",
        creatorId: "user-1",
        pageId: "page-1",
        spaceId: "space-1",
        workspaceId: "workspace-1",
        content: {},
      },
      input: { content: "{}" },
    })).toThrow("You can only edit your own comments");
  });

  test("preserves delete authorization semantics for owners and space managers", () => {
    const comment = { id: "comment-1", creatorId: "user-1" };

    expect(canDeleteDocumentComment({ comment, userId: "user-1", canManageSpace: false })).toBe(true);
    expect(canDeleteDocumentComment({ comment, userId: "user-2", canManageSpace: true })).toBe(true);
    expect(canDeleteDocumentComment({ comment, userId: "user-2", canManageSpace: false })).toBe(false);
  });

  test("parses comment JSON and rejects invalid content", () => {
    expect(parseDocumentCommentContent("{\"ok\":true}")).toEqual({ ok: true });
    expect(() => parseDocumentCommentContent("{bad")).toThrow("Invalid comment content JSON");
  });
});
