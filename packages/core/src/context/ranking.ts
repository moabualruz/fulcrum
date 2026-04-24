import type { ContextItem } from "@fulcrum/shared";

const evidenceWeight: Record<ContextItem["evidenceType"], number> = {
  exact_code: 100,
  path: 90,
  structural: 80,
  task: 75,
  memory: 65,
  repo_map: 55,
  recent_run: 50,
  artifact: 45,
  quality_gate: 40,
  policy: 38,
  operator_note: 36,
  graph: 34,
  semantic: 20,
  fallback: 10
};

export function rankContextItems(items: ContextItem[]): ContextItem[] {
  return [...items]
    .sort((left, right) => {
      const evidenceDelta = evidenceWeight[right.evidenceType] - evidenceWeight[left.evidenceType];
      if (evidenceDelta !== 0) {
        return evidenceDelta;
      }
      return left.title.localeCompare(right.title);
    })
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function estimateBudget(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
