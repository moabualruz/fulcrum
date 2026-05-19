export type DependencyRunState = "queued" | "running" | "blocked" | "succeeded" | "failed" | "canceled";

export interface DependencyNode {
  id: string;
  label: string;
  state: DependencyRunState;
  dependsOn: string[];
  blockers: string[];
  latestFeedback?: string | null;
}

export interface OrderedDependencyNode extends DependencyNode {
  depth: number;
}

export function orderDependencies(nodes: readonly DependencyNode[]): OrderedDependencyNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();

  function depthOf(id: string, visiting: Set<string>): number {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const node = byId.get(id);
    if (!node || node.dependsOn.length === 0) {
      depth.set(id, 0);
      return 0;
    }
    const parents = node.dependsOn.map((parent) => depthOf(parent, visiting));
    const value = parents.length > 0 ? Math.max(...parents) + 1 : 0;
    depth.set(id, value);
    return value;
  }

  return [...nodes]
    .map((node) => ({ ...node, depth: depthOf(node.id, new Set()) }))
    .sort((a, b) => (a.depth - b.depth) || a.label.localeCompare(b.label));
}

export type DependencyAction = "dispatch" | "retry" | "cancel";

export function availableActions(node: DependencyNode): DependencyAction[] {
  switch (node.state) {
    case "queued":
    case "blocked":
      return ["dispatch", "cancel"];
    case "running":
      return ["cancel"];
    case "failed":
      return ["retry", "cancel"];
    case "succeeded":
    case "canceled":
      return [];
  }
}

export function isActionableState(state: DependencyRunState): boolean {
  return state !== "succeeded" && state !== "canceled";
}

export function summarizeBlockers(node: DependencyNode): string {
  if (node.blockers.length === 0) return "";
  return `blocked by ${node.blockers.join(", ")}`;
}
