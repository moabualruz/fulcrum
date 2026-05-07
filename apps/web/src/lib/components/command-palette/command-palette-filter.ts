import { scoreCommand } from "./score";

export interface CommandItem {
  id: string;
  label: string;
  href?: string;
}

type ScoredItem = {
  item: CommandItem;
  score: number;
};

export function filterAndSort(items: CommandItem[], query: string): CommandItem[] {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return items;

  return items
    .map((item): ScoredItem => ({ item, score: scoreCommand(item.label, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.item.label.localeCompare(right.item.label);
    })
    .map(({ item }) => item);
}
