export type DocScope = "project" | "global";

export interface DocTreeNode {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  projectId: string | null;
  scope: DocScope;
  docType: string;
  sortPosition: number;
  children: DocTreeNode[];
}

export interface FlatDocTreeItem {
  node: DocTreeNode;
  depth: number;
}

export interface DocMoveInput {
  id: string;
  parentId: string | null;
  sortPosition: number;
}

export function buildDocTree(rows: readonly DocTreeNode[]): DocTreeNode[] {
  const byId = new Map<string, DocTreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });

  const roots: DocTreeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    const parent = row.parentId ? byId.get(row.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: DocTreeNode[]) => {
    nodes.sort((a, b) => a.sortPosition - b.sortPosition || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

export function flattenDocTree(nodes: readonly DocTreeNode[], depth = 1): FlatDocTreeItem[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenDocTree(node.children, depth + 1),
  ]);
}

export function docTypeMeta(docType: string): { icon: string; label: string; badgeClass: string } {
  const meta: Record<string, { icon: string; label: string; badgeClass: string }> = {
    spec: { icon: "FileText", label: "Spec", badgeClass: "bg-purple-100 text-purple-800" },
    adr: { icon: "Scale", label: "ADR", badgeClass: "bg-red-100 text-red-800" },
    wiki: { icon: "BookOpen", label: "Wiki", badgeClass: "bg-blue-100 text-blue-800" },
    runbook: { icon: "ListChecks", label: "Runbook", badgeClass: "bg-emerald-100 text-emerald-800" },
    meeting: { icon: "CalendarDays", label: "Meeting", badgeClass: "bg-amber-100 text-amber-800" },
    postmortem: { icon: "Activity", label: "Postmortem", badgeClass: "bg-orange-100 text-orange-800" },
    rfc: { icon: "MessagesSquare", label: "RFC", badgeClass: "bg-cyan-100 text-cyan-800" },
    note: { icon: "StickyNote", label: "Note", badgeClass: "bg-slate-100 text-slate-800" },
    scratch: { icon: "Pencil", label: "Scratch", badgeClass: "bg-zinc-100 text-zinc-800" },
  };
  return meta[docType] ?? { icon: "File", label: docType, badgeClass: "bg-muted text-muted-foreground" };
}

export function midpoint(previous: number | null, next: number | null): number {
  if (previous === null && next === null) return 1;
  if (previous === null) return next! - 1;
  if (next === null) return previous + 1;
  return (previous + next) / 2;
}

export function buildMoveInput(input: {
  docId: string;
  parentId: string | null;
  previousSibling?: { id: string; sortPosition: number } | null;
  nextSibling?: { id: string; sortPosition: number } | null;
}): DocMoveInput {
  return {
    id: input.docId,
    parentId: input.parentId,
    sortPosition: midpoint(
      input.previousSibling?.sortPosition ?? null,
      input.nextSibling?.sortPosition ?? null,
    ),
  };
}

export function nextScopeUrl(url: URL, scope: DocScope): string {
  const next = new URL(url);
  next.searchParams.set("scope", scope);
  return `${next.pathname}?${next.searchParams.toString()}`;
}
