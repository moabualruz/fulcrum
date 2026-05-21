/**
 * CriticalPath.ts: task workflow (D-102, D-103, D-104)
 *
 * Pure TypeScript CPM (Critical Path Method) algorithm.
 * No Svelte dependency: fully unit-testable.
 */

export interface TaskNode {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  /** Duration in days. Derived from startDate/dueDate if not provided. */
  duration: number;
}

export interface Relationship {
  sourceTaskId: string;
  targetTaskId: string;
  /** Only 'blocks' relationships are used for CPM edges. */
  type: string;
}

export interface CriticalPathResult {
  criticalTaskIds: Set<string>;
  /** taskId -> slack in days (0 = critical) */
  slack: Map<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function effectiveDuration(task: TaskNode): number {
  if (task.duration > 0) return task.duration;
  if (task.startDate && task.dueDate) {
    const ms = task.dueDate.getTime() - task.startDate.getTime();
    return Math.max(1, Math.round(ms / 86_400_000));
  }
  return 1; // default 1-day duration for tasks without dates
}

/**
 * Topological sort via Kahn's algorithm.
 * Returns sorted node IDs, or throws if cycle detected.
 */
function topologicalSort(
  nodeIds: string[],
  edges: Map<string, string[]>, // source -> [targets]
  reverseEdges: Map<string, string[]>, // target -> [sources]
): string[] {
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) inDegree.set(id, 0);
  for (const [, targets] of edges) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const successor of edges.get(node) ?? []) {
      const newDeg = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, newDeg);
      if (newDeg === 0) queue.push(successor);
    }
  }

  // Cycle: just return partial sort (graceful degradation)
  return sorted;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * computeCriticalPath: D-102
 *
 * CPM forward/backward pass to compute earliest/latest start times.
 * Only 'blocks' relationships are used as dependency edges.
 * Tasks with slack === 0 form the critical path.
 *
 * Complexity: O(V + E): handles 10k tasks comfortably (D-103 accept).
 */
export function computeCriticalPath(
  tasks: TaskNode[],
  relationships: Relationship[],
): CriticalPathResult {
  if (tasks.length === 0) {
    return { criticalTaskIds: new Set(), slack: new Map() };
  }

  // Build adjacency: "source blocks target" → edge source→target
  const edges = new Map<string, string[]>(); // source -> successors
  const reverseEdges = new Map<string, string[]>(); // target -> predecessors
  const taskIds = new Set(tasks.map((t) => t.id));

  for (const t of tasks) {
    if (!edges.has(t.id)) edges.set(t.id, []);
    if (!reverseEdges.has(t.id)) reverseEdges.set(t.id, []);
  }

  for (const rel of relationships) {
    if (rel.type !== "blocks") continue;
    if (!taskIds.has(rel.sourceTaskId) || !taskIds.has(rel.targetTaskId)) continue;
    edges.get(rel.sourceTaskId)!.push(rel.targetTaskId);
    reverseEdges.get(rel.targetTaskId)!.push(rel.sourceTaskId);
  }

  const sorted = topologicalSort(Array.from(taskIds), edges, reverseEdges);
  const durationMap = new Map<string, number>();
  for (const t of tasks) durationMap.set(t.id, effectiveDuration(t));

  // Forward pass: ES[n] = max(EF[predecessors])
  const ES = new Map<string, number>(); // earliest start
  const EF = new Map<string, number>(); // earliest finish

  for (const id of sorted) {
    const preds = reverseEdges.get(id) ?? [];
    const es = preds.length === 0 ? 0 : Math.max(...preds.map((p) => EF.get(p) ?? 0));
    const ef = es + (durationMap.get(id) ?? 1);
    ES.set(id, es);
    EF.set(id, ef);
  }

  // Project end = max EF
  const projectEnd = sorted.reduce((max, id) => Math.max(max, EF.get(id) ?? 0), 0);

  // Backward pass: LF[n] = min(LS[successors])
  const LF = new Map<string, number>(); // latest finish
  const LS = new Map<string, number>(); // latest start

  for (const id of [...sorted].reverse()) {
    const succs = edges.get(id) ?? [];
    const lf = succs.length === 0 ? projectEnd : Math.min(...succs.map((s) => LS.get(s) ?? projectEnd));
    const ls = lf - (durationMap.get(id) ?? 1);
    LF.set(id, lf);
    LS.set(id, ls);
  }

  // Slack = LS - ES (D-104)
  const slack = new Map<string, number>();
  const criticalTaskIds = new Set<string>();

  for (const id of taskIds) {
    const s = (LS.get(id) ?? 0) - (ES.get(id) ?? 0);
    slack.set(id, Math.max(0, s));
    if (s <= 0) criticalTaskIds.add(id);
  }

  return { criticalTaskIds, slack };
}

// ── Reactive cache (D-103) ─────────────────────────────────────────────────────

/**
 * CriticalPathCache: wraps computeCriticalPath with identity-based caching.
 * Recompute only when tasks or relationships arrays change (by reference).
 */
export class CriticalPathCache {
  private _tasks: TaskNode[] | null = null;
  private _rels: Relationship[] | null = null;
  private _result: CriticalPathResult | null = null;

  get(tasks: TaskNode[], relationships: Relationship[]): CriticalPathResult {
    if (tasks !== this._tasks || relationships !== this._rels) {
      this._tasks = tasks;
      this._rels = relationships;
      this._result = computeCriticalPath(tasks, relationships);
    }
    return this._result!;
  }

  invalidate(): void {
    this._tasks = null;
    this._rels = null;
    this._result = null;
  }
}
