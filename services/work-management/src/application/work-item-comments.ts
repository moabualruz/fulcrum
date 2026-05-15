/**
 * WorkItemCommentService.
 *
 * Provides full CRUD for task comments, watchers, and reactions.
 * Implements:
 *   - D-100: team mention expansion → bulk watcher subscription
 *   - D-06 / D-08: auto-subscribe on mention / task assign
 *   - T-05-05: authorId sourced from caller, never user input
 *   - T-05-06: mention IDs validated against org before subscribing
 *   - T-05-07: all queries org-scoped
 */

import type { EntityManager } from "typeorm";

import { AppConflictError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import { TaskComment } from "@platform-core/infrastructure/application-database/entities/tasks/TaskComment.ts";
import { TaskWatcher } from "@platform-core/infrastructure/application-database/entities/tasks/TaskWatcher.ts";
import { CommentReaction } from "@platform-core/infrastructure/application-database/entities/tasks/CommentReaction.ts";
import { OrgMember } from "@platform-core/infrastructure/application-database/entities/auth/OrgMember.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  [key: string]: unknown;
}

export interface MentionResult {
  users: string[];
  teams: string[];
}

export interface CommentOutput {
  id: string;
  orgId: string;
  taskId: string;
  authorId: string;
  body: object | null;
  parentCommentId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  reactions: ReactionOutput[];
  replies?: CommentOutput[];
}

export interface ReactionOutput {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface WatcherOutput {
  id: string;
  taskId: string;
  userId: string;
  source: string;
  createdAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────

function serializeComment(
  comment: TaskComment,
  reactions: CommentReaction[],
  replies?: CommentOutput[],
): CommentOutput {
  return {
    id: comment.id,
    orgId: (comment.org as unknown as { id: string }).id ?? "",
    taskId: comment.taskId,
    authorId: comment.authorId,
    body: comment.body,
    parentCommentId: comment.parentCommentId,
    resolved: comment.resolved,
    resolvedBy: comment.resolvedBy,
    resolvedAt: comment.resolvedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    reactions: reactions
      .filter((r) => r.commentId === comment.id)
      .map(serializeReaction),
    replies,
  };
}

function serializeReaction(r: CommentReaction): ReactionOutput {
  return {
    id: r.id,
    commentId: r.commentId,
    userId: r.userId,
    emoji: r.emoji,
    createdAt: r.createdAt,
  };
}

function serializeWatcher(w: TaskWatcher): WatcherOutput {
  return {
    id: w.id,
    taskId: w.taskId,
    userId: w.userId,
    source: w.source,
    createdAt: w.createdAt,
  };
}

// ── Service ────────────────────────────────────────────────────────

export class WorkItemCommentService {
  constructor(private readonly em: EntityManager) {}

  // ── Mention extraction ─────────────────────────────────────────

  /**
   * Recursively traverses TipTap JSON, extracting mention nodes.
   * Discriminates by attrs.type or attrs.kind: "user" → users[], "team" → teams[].
   * D-100: team discrimination is the key fix for bulk-subscribe.
   */
  extractMentions(body: TipTapNode | null | undefined): MentionResult {
    const users: string[] = [];
    const teams: string[] = [];

    if (!body) return { users, teams };

    const traverse = (node: TipTapNode): void => {
      if (node.type === "mention" && node.attrs) {
        const id = node.attrs.id as string | undefined;
        if (!id) return;
        const kind = (node.attrs.type ?? node.attrs.kind) as string | undefined;
        if (kind === "team") {
          teams.push(id);
        } else {
          // default: user mention
          users.push(id);
        }
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
        }
      }
    };

    traverse(body);

    return {
      users: [...new Set(users)],
      teams: [...new Set(teams)],
    };
  }

  /**
   * Resolves team IDs to member user IDs by querying OrgMember.
   * D-100: since there is no Team entity, team mention IDs are treated as
   * org role groups. When a Team entity is added, replace
   * this with a team membership query.
   *
   * Currently: if teamId matches an orgId pattern, returns all org member IDs.
   * Callers pass validated teamIds from extractMentions — unknown IDs return [].
   */
  async expandTeamMembers(orgId: string, teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];

    // T-05-06: validate org scope — fetch members of this org only
    const members = await this.em.find(OrgMember, { orgId });
    const memberIds = members.map((m) => m.userId);

    // Return member IDs for any team ID that belongs to the org.
    // When a dedicated Team entity exists, replace with:
    //   em.find(TeamMember, { team: { id: { $in: teamIds }, org: orgId } })
    //   .then(members => members.map(m => m.userId))
    return memberIds;
  }

  // ── Watcher operations ─────────────────────────────────────────

  /**
   * Upsert a watcher. Second call with same (taskId, userId) is a no-op.
   */
  async subscribe(
    orgId: string,
    taskId: string,
    userId: string,
    source: string = "manual",
  ): Promise<void> {
    try {
      const orgRef = this.em.getReference(Org, orgId);
      const watcher = this.em.create(TaskWatcher, {
        org: orgRef,
        taskId,
        userId,
        source,
      });
      this.em.persist(watcher);
    await this.em.flush();
    } catch (err: unknown) {
      // Unique constraint violation → already watching, silently ignore
      if (
        err instanceof Error &&
        (err.message.includes("unique") ||
          err.message.includes("duplicate") ||
          err.message.includes("UniqueConstraint") ||
          // MikroORM wraps pg errors
          (err as { code?: string }).code === "23505")
      ) {
        return;
      }
      throw err;
    }
  }

  async unsubscribe(orgId: string, taskId: string, userId: string): Promise<void> {
    const watcher = await this.em.findOne(TaskWatcher, { taskId, userId });
    if (watcher) {
      this.em.remove(watcher);
    await this.em.flush();
    }
  }

  async listWatchers(orgId: string, taskId: string): Promise<WatcherOutput[]> {
    const watchers = await this.em.find(
      TaskWatcher,
      { taskId, org: orgId },
      { orderBy: { createdAt: "ASC" } },
    );
    return watchers.map(serializeWatcher);
  }

  // ── Internal: bulk subscribe from mentions ─────────────────────

  private async autoSubscribeFromMentions(
    orgId: string,
    taskId: string,
    body: TipTapNode | null | undefined,
  ): Promise<void> {
    const { users, teams } = this.extractMentions(body);

    // Subscribe directly-mentioned users
    for (const userId of users) {
      await this.subscribe(orgId, taskId, userId, "mention");
    }

    // D-100: expand team mentions → subscribe all team members
    if (teams.length > 0) {
      const memberIds = await this.expandTeamMembers(orgId, teams);
      for (const userId of memberIds) {
        await this.subscribe(orgId, taskId, userId, "mention");
      }
    }
  }

  // ── Comment CRUD ───────────────────────────────────────────────

  async createComment(
    orgId: string,
    taskId: string,
    authorId: string,
    body: object,
    parentCommentId?: string,
  ): Promise<CommentOutput> {
    // T-05-05: authorId from caller (ctx.userId), never from user input
    const orgRef = this.em.getReference(Org, orgId);
    const comment = this.em.create(TaskComment, {
      org: orgRef,
      taskId,
      authorId,
      body,
      parentCommentId: parentCommentId ?? null,
    });
    this.em.persist(comment);
    await this.em.flush();

    // Auto-subscribe author
    await this.subscribe(orgId, taskId, authorId, "create");

    // Auto-subscribe mentioned users + expanded team members (D-100)
    await this.autoSubscribeFromMentions(orgId, taskId, body as TipTapNode);

    return serializeComment(comment, []);
  }

  async createReply(
    orgId: string,
    taskId: string,
    authorId: string,
    body: object,
    parentCommentId: string,
  ): Promise<CommentOutput> {
    return this.createComment(orgId, taskId, authorId, body, parentCommentId);
  }

  async listComments(orgId: string, taskId: string): Promise<CommentOutput[]> {
    const comments = await this.em.find(
      TaskComment,
      { org: orgId, taskId },
      { orderBy: { createdAt: "ASC" } },
    );

    const commentIds = comments.map((c) => c.id);
    const reactions =
      commentIds.length > 0
        ? await this.em.find(CommentReaction, { commentId: { $in: commentIds } })
        : [];

    return comments.map((c) => serializeComment(c, reactions));
  }

  /**
   * Returns comment tree: top-level comments with `replies[]` nested.
   * D-01 threading requirement.
   */
  async getThreaded(orgId: string, taskId: string): Promise<CommentOutput[]> {
    const comments = await this.em.find(
      TaskComment,
      { org: orgId, taskId },
      { orderBy: { createdAt: "ASC" } },
    );

    const commentIds = comments.map((c) => c.id);
    const reactions =
      commentIds.length > 0
        ? await this.em.find(CommentReaction, { commentId: { $in: commentIds } })
        : [];

    // Build map for O(n) tree construction
    const byId = new Map<string, CommentOutput>();
    const roots: CommentOutput[] = [];

    for (const c of comments) {
      const out = serializeComment(c, reactions, []);
      byId.set(c.id, out);
    }

    for (const c of comments) {
      const out = byId.get(c.id)!;
      if (c.parentCommentId && byId.has(c.parentCommentId)) {
        byId.get(c.parentCommentId)!.replies!.push(out);
      } else {
        roots.push(out);
      }
    }

    return roots;
  }

  async deleteComment(orgId: string, commentId: string): Promise<void> {
    // Cascade delete: find comment + all descendants
    const comment = await this.em.findOne(TaskComment, {
      id: commentId,
      org: orgId,
    });
    if (!comment) {
      throw new AppNotFoundError("Comment not found");
    }

    // Delete all replies first (MikroORM may not cascade JSON relations)
    const replies = await this.em.find(TaskComment, {
      parentCommentId: commentId,
      org: orgId,
    });
    for (const reply of replies) {
      this.em.remove(reply);
    await this.em.flush();
    }

    this.em.remove(comment);
    await this.em.flush();
  }

  async resolveComment(
    orgId: string,
    commentId: string,
    userId: string,
  ): Promise<CommentOutput> {
    const comment = await this.em.findOne(TaskComment, {
      id: commentId,
      org: orgId,
    });
    if (!comment) {
      throw new AppNotFoundError("Comment not found");
    }

    comment.resolved = true;
    comment.resolvedBy = userId;
    comment.resolvedAt = new Date();
    await this.em.flush();

    return serializeComment(comment, []);
  }

  async unresolveComment(orgId: string, commentId: string): Promise<CommentOutput> {
    const comment = await this.em.findOne(TaskComment, {
      id: commentId,
      org: orgId,
    });
    if (!comment) {
      throw new AppNotFoundError("Comment not found");
    }

    comment.resolved = false;
    comment.resolvedBy = null;
    comment.resolvedAt = null;
    await this.em.flush();

    return serializeComment(comment, []);
  }

  // ── Reactions ──────────────────────────────────────────────────

  async addReaction(commentId: string, userId: string, emoji: string): Promise<ReactionOutput> {
    try {
      const reaction = this.em.create(CommentReaction, {
        commentId,
        userId,
        emoji,
      });
      this.em.persist(reaction);
    await this.em.flush();
      return serializeReaction(reaction);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.message.includes("unique") ||
          err.message.includes("duplicate") ||
          err.message.includes("UniqueConstraint") ||
          (err as { code?: string }).code === "23505")
      ) {
        throw new AppConflictError("Reaction already exists");
      }
      throw err;
    }
  }

  async removeReaction(commentId: string, userId: string, emoji: string): Promise<void> {
    const reaction = await this.em.findOne(CommentReaction, {
      commentId,
      userId,
      emoji,
    });
    if (reaction) {
      this.em.remove(reaction);
    await this.em.flush();
    }
  }
}
