/**
 * RelationshipService — Phase 05 Plan 04.
 *
 * Full CRUD for TaskRelationship with cycle detection (HIGH-04 fix).
 * D-122: markAsDuplicate with auto-close + watcher transfer.
 * D-123: listBlockedBy — reverse direction query.
 *
 * Security:
 *   - Both tasks validated to exist in caller's org (T-05-10 mitigation)
 *   - Cycle detection max depth 50 prevents DoS (T-05-09 mitigation)
 */

import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";

import { TaskRelationship } from "../db/entities/tasks/TaskRelationship.ts";
import { TaskWatcher } from "../db/entities/tasks/TaskWatcher.ts";
import { Task } from "../db/entities/tasks/Task.ts";
import { Org } from "../db/entities/auth/Org.ts";

// ── Constants ──────────────────────────────────────────────────────────────────

const RELATIONSHIP_TYPES = ["blocks", "relates_to", "duplicate_of"] as const;
export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

const MAX_CYCLE_DEPTH = 50;

// ── Output types ──────────────────────────────────────────────────────────────

export interface RelationshipOutput {
  id: string;
  orgId: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: string;
  createdBy: string;
  createdAt: Date;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class RelationshipService {
  constructor(private readonly em: EntityManager) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async findTaskInOrg(orgId: string, taskId: string): Promise<Task> {
    const task = await this.em.findOne(Task, {
      id: taskId,
      org: { id: orgId },
    } as never);

    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task ${taskId} not found in org ${orgId}`,
      });
    }

    return task;
  }

  private serialize(rel: TaskRelationship): RelationshipOutput {
    return {
      id: rel.id,
      orgId: (rel.org as Org).id,
      sourceTaskId: rel.sourceTaskId,
      targetTaskId: rel.targetTaskId,
      type: rel.type,
      createdBy: rel.createdBy,
      createdAt: rel.createdAt,
    };
  }

  // ── Cycle detection (BFS/DFS, max depth 50) ───────────────────────────────────

  async checkCycle(orgId: string, sourceId: string, targetId: string): Promise<boolean> {
    // DFS: starting from targetId, follow 'blocks' edges (source→target).
    // If we reach sourceId, adding source→target would create a cycle.
    const visited = new Set<string>();
    const stack: Array<{ id: string; depth: number }> = [{ id: targetId, depth: 0 }];

    while (stack.length > 0) {
      const { id: currentId, depth } = stack.pop()!;

      if (currentId === sourceId) return true;
      if (visited.has(currentId)) continue;
      if (depth >= MAX_CYCLE_DEPTH) continue;

      visited.add(currentId);

      const outgoing = await this.em.find(TaskRelationship, {
        sourceTaskId: currentId,
        type: "blocks",
        org: { id: orgId },
      } as never);

      for (const rel of outgoing) {
        stack.push({ id: rel.targetTaskId, depth: depth + 1 });
      }
    }

    return false;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async create(
    orgId: string,
    sourceTaskId: string,
    targetTaskId: string,
    type: RelationshipType,
    createdBy: string,
  ): Promise<RelationshipOutput> {
    if (sourceTaskId === targetTaskId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot create self-referential relationship",
      });
    }

    // Validate both tasks exist in org (T-05-10)
    await this.findTaskInOrg(orgId, sourceTaskId);
    await this.findTaskInOrg(orgId, targetTaskId);

    // Cycle check for 'blocks' type (T-05-09)
    if (type === "blocks") {
      const hasCycle = await this.checkCycle(orgId, sourceTaskId, targetTaskId);
      if (hasCycle) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Creating this blocks relationship would create a cycle`,
        });
      }
    }

    const rel = this.em.create(TaskRelationship, {
      org: { id: orgId },
      sourceTaskId,
      targetTaskId,
      type,
      createdBy,
    } as never);

    await this.em.persistAndFlush(rel);
    return this.serialize(rel);
  }

  async delete(orgId: string, relationshipId: string): Promise<void> {
    const rel = await this.em.findOne(TaskRelationship, {
      id: relationshipId,
      org: { id: orgId },
    } as never);

    if (!rel) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Relationship ${relationshipId} not found`,
      });
    }

    this.em.remove(rel);
    await this.em.flush();
  }

  async listForTask(orgId: string, taskId: string): Promise<RelationshipOutput[]> {
    const rels = await this.em.find(TaskRelationship, {
      $or: [
        { sourceTaskId: taskId },
        { targetTaskId: taskId },
      ],
      org: { id: orgId },
    } as never);

    return rels.map((r) => this.serialize(r));
  }

  async listBlockers(orgId: string, taskId: string): Promise<RelationshipOutput[]> {
    const rels = await this.em.find(TaskRelationship, {
      targetTaskId: taskId,
      type: "blocks",
      org: { id: orgId },
    } as never);

    return rels.map((r) => this.serialize(r));
  }

  /** D-123: reverse query — tasks that THIS task blocks */
  async listBlockedBy(orgId: string, taskId: string): Promise<RelationshipOutput[]> {
    const rels = await this.em.find(TaskRelationship, {
      sourceTaskId: taskId,
      type: "blocks",
      org: { id: orgId },
    } as never);

    return rels.map((r) => this.serialize(r));
  }

  async getBlockedItems(orgId: string, projectId: string): Promise<RelationshipOutput[]> {
    // All tasks that are targets of 'blocks' relationships in the org.
    // Note: tasks don't have projectId on this entity version; filter by org scope.
    // When Project-Task FK exists, add projectId filter here.
    const rels = await this.em.find(TaskRelationship, {
      type: "blocks",
      org: { id: orgId },
    } as never);

    return rels.map((r) => this.serialize(r));
  }

  /** D-122: mark source as duplicate of target with optional auto-close + watcher transfer */
  async markAsDuplicate(
    orgId: string,
    sourceTaskId: string,
    targetTaskId: string,
    opts: { autoClose?: boolean; transferWatchers?: boolean } = {},
  ): Promise<RelationshipOutput> {
    const [sourceTask] = await Promise.all([
      this.findTaskInOrg(orgId, sourceTaskId),
      this.findTaskInOrg(orgId, targetTaskId),
    ]);

    // Create duplicate_of relationship
    const rel = this.em.create(TaskRelationship, {
      org: { id: orgId },
      sourceTaskId,
      targetTaskId,
      type: "duplicate_of",
      createdBy: sourceTaskId, // system action — use sourceTaskId as actor reference
    } as never);

    await this.em.persistAndFlush(rel);

    // Auto-close: set source task to a canceled-category status
    if (opts.autoClose) {
      (sourceTask as Task & { status: string | null }).status = "Canceled";
      await this.em.flush();
    }

    // Transfer watchers from source to target
    if (opts.transferWatchers) {
      const sourceWatchers = await this.em.find(TaskWatcher, {
        taskId: sourceTaskId,
        org: { id: orgId },
      } as never);

      for (const watcher of sourceWatchers) {
        // Check if target already has this watcher
        const existing = await this.em.findOne(TaskWatcher, {
          taskId: targetTaskId,
          userId: watcher.userId,
          org: { id: orgId },
        } as never);

        if (!existing) {
          const newWatcher = this.em.create(TaskWatcher, {
            org: { id: orgId },
            taskId: targetTaskId,
            userId: watcher.userId,
            source: "duplicate_merge",
          } as never);
          await this.em.persistAndFlush(newWatcher);
        }
      }
    }

    return this.serialize(rel);
  }
}
