/**
 * CommentService unit tests — Phase 05 Plan 03
 *
 * Uses in-memory stubs for EntityManager to avoid DB dependency.
 * Tests cover: CRUD, threading, reactions, watchers, mention extraction (D-100).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { CommentService, type TipTapNode } from "./CommentService.ts";

// ── Minimal EntityManager stub ─────────────────────────────────────

type Entity = Record<string, unknown>;
type Cls = { name: string } | (new () => unknown);

function clsName(cls: Cls): string {
  return (cls as { name: string }).name;
}

/**
 * Match a stored entity row against a criteria object.
 * Handles:
 *   - Direct equality: { taskId: "x" }
 *   - $in operator: { commentId: { $in: ["a","b"] } }
 *   - Org reference: { org: "org-id" } matches rows where org.id === "org-id"
 */
function matchesCriteria(row: Entity, criteria: Record<string, unknown>): boolean {
  return Object.entries(criteria).every(([k, v]) => {
    if (typeof v === "object" && v !== null && "$in" in (v as object)) {
      return ((v as { $in: unknown[] }).$in).includes(row[k]);
    }
    // Handle org/relation reference stored as { id: "..." }
    if (
      typeof row[k] === "object" &&
      row[k] !== null &&
      typeof v === "string" &&
      (row[k] as { id?: string }).id !== undefined
    ) {
      return (row[k] as { id: string }).id === v;
    }
    return row[k] === v;
  });
}

class MockEntityManager {
  // Public for test access via em["table"]
  public store: Map<string, Entity[]> = new Map();
  private idCounter = 0;

  public table(name: string): Entity[] {
    if (!this.store.has(name)) this.store.set(name, []);
    return this.store.get(name)!;
  }

  private nextId(): string {
    return `id-${++this.idCounter}`;
  }

  // Tracks last-created entity → table mapping for persistAndFlush
  private pendingEntity: { entity: Entity; tableName: string } | null = null;

  getReference(_cls: unknown, id: string): { id: string } {
    return { id };
  }

  create(cls: Cls, data: Entity): Entity & { id: string } {
    const obj: Entity & { id: string } = {
      ...data,
      id: this.nextId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Tag with class name so persistAndFlush knows where to store it
    Object.defineProperty(obj, "__tableName__", { value: clsName(cls), enumerable: false });
    this.pendingEntity = { entity: obj, tableName: clsName(cls) };
    return obj;
  }

  async persistAndFlush(entity: Entity): Promise<void> {
    // Use tagged class name if available
    const tableName =
      (entity as { __tableName__?: string }).__tableName__ ??
      this.pendingEntity?.tableName ??
      "Unknown";
    this.pendingEntity = null;
    this.table(tableName).push(entity);
  }

  async removeAndFlush(entity: Entity): Promise<void> {
    for (const [, rows] of this.store) {
      const idx = rows.indexOf(entity);
      if (idx !== -1) {
        rows.splice(idx, 1);
        return;
      }
    }
  }

  persist(entity: Entity): void {
    const tableName =
      (entity as { __tableName__?: string }).__tableName__ ??
      this.pendingEntity?.tableName ??
      "Unknown";
    this.pendingEntity = null;
    this.table(tableName).push(entity);
  }

  remove(entity: Entity): void {
    for (const [, rows] of this.store) {
      const idx = rows.indexOf(entity);
      if (idx !== -1) { rows.splice(idx, 1); return; }
    }
  }

  async flush(): Promise<void> {
    // no-op for in-memory
  }

  async findOne(cls: Cls, criteria: Record<string, unknown>): Promise<Entity | null> {
    const rows = this.table(clsName(cls));
    return rows.find((r) => matchesCriteria(r, criteria)) ?? null;
  }

  async find(cls: Cls, criteria: Record<string, unknown> = {}, _opts?: unknown): Promise<Entity[]> {
    const rows = this.table(clsName(cls));
    return rows.filter((r) => matchesCriteria(r, criteria));
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function makeService(em?: MockEntityManager) {
  const manager = em ?? new MockEntityManager();
  return {
    service: new CommentService(manager as unknown as import("@mikro-orm/postgresql").EntityManager),
    em: manager,
  };
}

const ORG_ID = "org-111";
const TASK_ID = "task-222";
const USER_A = "user-aaa";
const USER_B = "user-bbb";
const USER_C = "user-ccc";

// ── Tests ──────────────────────────────────────────────────────────

describe("CommentService - extractMentions", () => {
  it("returns empty arrays for null body", () => {
    const { service } = makeService();
    expect(service.extractMentions(null)).toEqual({ users: [], teams: [] });
  });

  it("extracts user mention IDs", () => {
    const { service } = makeService();
    const doc: TipTapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: USER_A, type: "user" } },
            { type: "mention", attrs: { id: USER_B, type: "user" } },
          ],
        },
      ],
    };
    const result = service.extractMentions(doc);
    expect(result.users).toContain(USER_A);
    expect(result.users).toContain(USER_B);
    expect(result.teams).toHaveLength(0);
  });

  it("extracts team mention IDs separately (D-100)", () => {
    const { service } = makeService();
    const doc: TipTapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "team-xyz", type: "team" } },
            { type: "mention", attrs: { id: USER_A, type: "user" } },
          ],
        },
      ],
    };
    const result = service.extractMentions(doc);
    expect(result.teams).toContain("team-xyz");
    expect(result.users).toContain(USER_A);
  });

  it("deduplicates repeated mention IDs", () => {
    const { service } = makeService();
    const doc: TipTapNode = {
      type: "doc",
      content: [
        { type: "mention", attrs: { id: USER_A, type: "user" } },
        { type: "mention", attrs: { id: USER_A, type: "user" } },
      ],
    };
    const result = service.extractMentions(doc);
    expect(result.users).toHaveLength(1);
  });
});

describe("CommentService - createComment", () => {
  it("stores body as JSON and returns with id", async () => {
    const { service } = makeService();
    const body = { type: "doc", content: [] };
    const comment = await service.createComment(ORG_ID, TASK_ID, USER_A, body);
    expect(comment.id).toBeTruthy();
    expect(comment.taskId).toBe(TASK_ID);
    expect(comment.authorId).toBe(USER_A);
    expect(comment.body).toEqual(body);
    expect(comment.parentCommentId).toBeNull();
  });

  it("auto-subscribes author as watcher with source=create", async () => {
    const em = new MockEntityManager();
    const { service } = makeService(em);
    await service.createComment(ORG_ID, TASK_ID, USER_A, { type: "doc", content: [] });
    const watchers = await service.listWatchers(ORG_ID, TASK_ID);
    expect(watchers.some((w) => w.userId === USER_A && w.source === "create")).toBe(true);
  });

  it("auto-subscribes mentioned users as watchers (D-06)", async () => {
    const em = new MockEntityManager();
    const { service } = makeService(em);
    const body: TipTapNode = {
      type: "doc",
      content: [{ type: "mention", attrs: { id: USER_B, type: "user" } }],
    };
    await service.createComment(ORG_ID, TASK_ID, USER_A, body);
    const watchers = await service.listWatchers(ORG_ID, TASK_ID);
    expect(watchers.some((w) => w.userId === USER_B && w.source === "mention")).toBe(true);
  });

  it("team mention expands to all org members (D-100)", async () => {
    const em = new MockEntityManager();
    // Pre-populate OrgMember rows
    const orgMembers = [
      { orgId: ORG_ID, userId: USER_B, role: "member", id: "om-1", joinedAt: new Date() },
      { orgId: ORG_ID, userId: USER_C, role: "member", id: "om-2", joinedAt: new Date() },
    ];
    for (const m of orgMembers) {
      em["table"]("OrgMember").push(m);
    }
    const { service } = makeService(em);

    const body: TipTapNode = {
      type: "doc",
      content: [{ type: "mention", attrs: { id: "team-eng", type: "team" } }],
    };
    await service.createComment(ORG_ID, TASK_ID, USER_A, body);
    const watchers = await service.listWatchers(ORG_ID, TASK_ID);
    const watcherIds = watchers.map((w) => w.userId);
    expect(watcherIds).toContain(USER_B);
    expect(watcherIds).toContain(USER_C);
  });
});

describe("CommentService - createReply", () => {
  it("sets parentCommentId and triggers same mention/subscribe logic", async () => {
    const em = new MockEntityManager();
    const { service } = makeService(em);

    const parent = await service.createComment(ORG_ID, TASK_ID, USER_A, {
      type: "doc",
      content: [],
    });

    const replyBody: TipTapNode = {
      type: "doc",
      content: [{ type: "mention", attrs: { id: USER_C, type: "user" } }],
    };
    const reply = await service.createReply(
      ORG_ID,
      TASK_ID,
      USER_B,
      replyBody,
      parent.id,
    );

    expect(reply.parentCommentId).toBe(parent.id);
    const watchers = await service.listWatchers(ORG_ID, TASK_ID);
    expect(watchers.some((w) => w.userId === USER_C && w.source === "mention")).toBe(true);
  });
});

describe("CommentService - resolve / unresolve", () => {
  it("sets resolved=true, resolvedBy, resolvedAt", async () => {
    const { service } = makeService();
    const comment = await service.createComment(ORG_ID, TASK_ID, USER_A, {
      type: "doc",
      content: [],
    });

    const resolved = await service.resolveComment(ORG_ID, comment.id, USER_B);
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedBy).toBe(USER_B);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
  });

  it("resets resolved fields on unresolve", async () => {
    const { service } = makeService();
    const comment = await service.createComment(ORG_ID, TASK_ID, USER_A, {
      type: "doc",
      content: [],
    });

    await service.resolveComment(ORG_ID, comment.id, USER_B);
    const unresolved = await service.unresolveComment(ORG_ID, comment.id);
    expect(unresolved.resolved).toBe(false);
    expect(unresolved.resolvedBy).toBeNull();
    expect(unresolved.resolvedAt).toBeNull();
  });
});

describe("CommentService - reactions", () => {
  it("addReaction returns reaction with id", async () => {
    const { service } = makeService();
    const comment = await service.createComment(ORG_ID, TASK_ID, USER_A, {
      type: "doc",
      content: [],
    });
    const reaction = await service.addReaction(comment.id, USER_B, "👍");
    expect(reaction.id).toBeTruthy();
    expect(reaction.emoji).toBe("👍");
    expect(reaction.userId).toBe(USER_B);
  });

  it("removeReaction deletes the reaction", async () => {
    const em = new MockEntityManager();
    const { service } = makeService(em);
    const comment = await service.createComment(ORG_ID, TASK_ID, USER_A, {
      type: "doc",
      content: [],
    });
    await service.addReaction(comment.id, USER_B, "👍");
    await service.removeReaction(comment.id, USER_B, "👍");
    // Verify removed
    const rows = em["table"]("CommentReaction");
    expect(rows.filter((r) => r.userId === USER_B && r.emoji === "👍")).toHaveLength(0);
  });
});

describe("CommentService - subscribe idempotency", () => {
  it("second subscribe call does not throw", async () => {
    const { service } = makeService();
    await service.subscribe(ORG_ID, TASK_ID, USER_A, "manual");
    // Mock EM doesn't enforce unique constraint — test that no error thrown
    await expect(
      service.subscribe(ORG_ID, TASK_ID, USER_A, "manual"),
    ).resolves.toBeUndefined();
  });

  it("listWatchers returns source field", async () => {
    const { service } = makeService();
    await service.subscribe(ORG_ID, TASK_ID, USER_A, "assign");
    const watchers = await service.listWatchers(ORG_ID, TASK_ID);
    expect(watchers[0]!.source).toBe("assign");
  });
});

describe("CommentService - getThreaded", () => {
  it("returns tree with replies nested under parent", async () => {
    const { service } = makeService();
    const body = { type: "doc", content: [] };
    const parent = await service.createComment(ORG_ID, TASK_ID, USER_A, body);
    await service.createReply(ORG_ID, TASK_ID, USER_B, body, parent.id);

    const tree = await service.getThreaded(ORG_ID, TASK_ID);
    // Exactly 1 root (the parent)
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe(parent.id);
    expect(tree[0]!.replies).toHaveLength(1);
    expect(tree[0]!.replies![0]!.parentCommentId).toBe(parent.id);
  });

  it("top-level comments have empty replies array", async () => {
    const { service } = makeService();
    await service.createComment(ORG_ID, TASK_ID, USER_A, { type: "doc", content: [] });
    const tree = await service.getThreaded(ORG_ID, TASK_ID);
    expect(tree[0]!.replies).toEqual([]);
  });
});

describe("CommentService - deleteComment", () => {
  it("cascades deletion to replies", async () => {
    const em = new MockEntityManager();
    const { service } = makeService(em);
    const body = { type: "doc", content: [] };
    const parent = await service.createComment(ORG_ID, TASK_ID, USER_A, body);
    await service.createReply(ORG_ID, TASK_ID, USER_B, body, parent.id);

    await service.deleteComment(ORG_ID, parent.id);

    const comments = await service.listComments(ORG_ID, TASK_ID);
    expect(comments).toHaveLength(0);
  });
});
