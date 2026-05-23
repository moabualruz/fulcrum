import type { Renderer } from "../renderer.ts";
import { c, truncate } from "../renderer.ts";
import { truncateWide } from "../utils/truncate.ts";

export interface TuiMemory {
  id: string;
  projectId?: string | null;
  kind?: string;
  key?: string | null;
  body?: string;
  content?: string;
  tags?: string[];
  importance?: string;
  source?: string;
  sourceRef?: Record<string, unknown>;
  global?: boolean;
  archived?: boolean;
  updatedAt?: string | Date | null;
  links?: Array<{ targetKind: string; targetId: string; label?: string | null }>;
}

interface MemoryCaller {
  list: (input?: Record<string, unknown>) => Promise<TuiMemory[]>;
  promote: (input: { id: string }) => Promise<unknown>;
  search?: (input: Record<string, unknown>) => Promise<TuiMemory[]>;
  archive?: (input: { id: string }) => Promise<unknown>;
  delete?: (input: { id: string }) => Promise<unknown>;
  forget?: (input: { id: string }) => Promise<unknown>;
  update?: (input: {
    id: string;
    body?: string;
    importance?: string;
    tags?: string[];
    forceEdit?: boolean;
  }) => Promise<TuiMemory | unknown>;
}

/**
 * tRPC caller shape for memory procedures via the `memories` router key.
 * Procedures: memories.list, memories.promote, memories.search (optional).
 */
export interface MemoryTrpcCaller {
  memories: {
    list: (input?: Record<string, unknown>) => Promise<TuiMemory[]>;
    promote: (input: { id: string }) => Promise<unknown>;
    search?: (input: Record<string, unknown>) => Promise<TuiMemory[]>;
  };
}

export interface MemoryBrowserScreenOptions {
  projectId?: string;
  searchDebounceMs?: number;
  viewportRows?: number;
  caller: {
    memory?: MemoryCaller;
    memories?: MemoryCaller;
  };
}

type Mode = "list" | "detail" | "edit";
type Focus = "facets" | "list";
type Facet = { group: "kind" | "importance" | "source" | "project"; value: string };

export interface MemoryEditInput {
  body?: string;
  importance?: string;
  tags?: string[];
}

export class MemoryBrowserScreen {
  private memories: TuiMemory[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private facetCursor = 0;
  private focus: Focus = "list";
  private selectedFacet: Facet | null = null;
  private globalOnly = false;
  private searchQuery = "";
  private searchOpen = false;
  private mode: Mode = "list";
  private confirmDelete = false;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: MemoryBrowserScreenOptions) {}

  async load(): Promise<void> {
    this.memories = await this.memoryCaller.list(this.baseInput());
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Memory"));
    renderer.separator();
    renderer.writeln();

    if (this.mode === "detail") {
      this.renderDetail(renderer);
      return;
    }

    if (this.mode === "edit") {
      this.renderEdit(renderer);
      return;
    }

    const filterText = this.globalOnly ? "Global only" : "Project + global";
    const facetText = this.selectedFacet ? `  Filter: ${this.selectedFacet.group}=${this.selectedFacet.value}` : "";
    renderer.writeln(`  ${filterText}${facetText}${this.searchOpen ? `  Search: ${this.searchQuery}` : ""}`);
    renderer.writeln();
    this.renderFacets(renderer);
    renderer.writeln();

    const rows = this.visibleMemories;
    if (rows.length === 0) {
      renderer.writeln(c.dim(this.projectIdText()));
    }

    for (let i = 0; i < rows.length; i++) {
      const memory = rows[i]!;
      const selected = this.scrollTop + i === this.cursor;
      const badge = memory.global ? " [global]" : " [project]";
      const importance = memory.importance ? ` !${memory.importance}` : "";
      const kind = memory.kind ? ` <${memory.kind}>` : "";
      const line = `  ${memoryLabel(memory)}${badge}${kind}${importance}  ${truncate(memoryText(memory), Math.max(24, renderer.width - 58))}`;
      const visibleLine = truncateWide(line, Math.max(20, renderer.width));
      renderer.writeln(selected ? c.inverse(visibleLine) : visibleLine);
    }

    renderer.writeln();
    if (this.confirmDelete) renderer.writeln(c.bold(`  Delete ${memoryLabel(this.currentMemory!)}? [y/N]`));
    renderer.writeln(c.dim(truncateWide("  j/k move  f facets  Tab focus  / search  Enter detail/apply  g promote  a archive  e edit  d delete  q close", Math.max(20, renderer.width))));
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.mode === "detail") {
      if (key === "q" || key === "\x1b") {
        this.mode = "list";
        return true;
      }
      if (key === "g" || key === "p") {
        await this.promoteCurrent();
        return true;
      }
      return false;
    }

    if (this.mode === "edit") {
      if (key === "q" || key === "\x1b") {
        this.mode = "list";
        return true;
      }
      return false;
    }

    if (this.confirmDelete) {
      if (key.toLowerCase() === "y") {
        await this.deleteCurrent();
      }
      this.confirmDelete = false;
      return true;
    }

    if (key === "q" || key === "\x1b") return true;
    if (key === "\t") {
      this.focus = this.focus === "list" ? "facets" : "list";
      return true;
    }
    if (key === "f") {
      this.focus = "facets";
      this.facetCursor = 0;
      return true;
    }
    if (key === "G") {
      this.globalOnly = !this.globalOnly;
      this.cursor = 0;
      this.scrollTop = 0;
      this.clampCursor();
      return true;
    }
    if (key === "/") {
      this.searchOpen = true;
      return true;
    }
    if (key === "j" || key === "\x1b[B") {
      if (this.focus === "facets") this.facetCursor = Math.min(this.facetCursor + 1, Math.max(0, this.facets.length - 1));
      else {
        this.cursor = Math.min(this.cursor + 1, Math.max(0, this.filteredMemories.length - 1));
        this.keepCursorVisible();
      }
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      if (this.focus === "facets") this.facetCursor = Math.max(0, this.facetCursor - 1);
      else {
        this.cursor = Math.max(0, this.cursor - 1);
        this.keepCursorVisible();
      }
      return true;
    }
    if (key === "\r" || key === "\n") {
      if (this.focus === "facets") {
        this.selectedFacet = this.facets[this.facetCursor] ?? null;
        this.focus = "list";
        this.cursor = 0;
        this.scrollTop = 0;
        this.clampCursor();
        return true;
      }
      if (!this.currentMemory) return false;
      this.mode = "detail";
      return true;
    }
    if (key === "a") {
      await this.archiveCurrent();
      return true;
    }
    if (key === "d") {
      if (!this.currentMemory) return false;
      this.confirmDelete = true;
      return true;
    }
    if (key === "e") {
      if (!this.currentMemory) return false;
      this.mode = "edit";
      return true;
    }
    return false;
  }

  setSearchQuery(query: string): void {
    this.searchOpen = true;
    this.searchQuery = query;
    this.cursor = 0;
    this.scrollTop = 0;
    this.clampCursor();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.runSearch(), this.opts.searchDebounceMs ?? 200);
  }

  async submitEdit(input: MemoryEditInput): Promise<void> {
    const memory = this.currentMemory;
    if (!memory || !this.memoryCaller.update) return;
    const updated = await this.memoryCaller.update({ id: memory.id, ...input, forceEdit: true });
    this.memories = this.memories.map((item) => item.id === memory.id ? { ...item, ...(updated as TuiMemory), ...input } : item);
    this.mode = "list";
    this.clampCursor();
  }

  get filteredMemories(): TuiMemory[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.memories
      .filter((memory) => !memory.archived)
      .filter((memory) => !this.globalOnly || memory.global)
      .filter((memory) => this.matchesFacet(memory))
      .filter((memory) => {
        if (!query) return true;
        return [memoryLabel(memory), memoryText(memory), ...(memory.tags ?? [])].join(" ").toLowerCase().includes(query);
      });
  }

  get visibleMemories(): TuiMemory[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.filteredMemories.slice(this.scrollTop, this.scrollTop + rows);
  }

  private get memoryCaller(): MemoryCaller {
    const caller = this.opts.caller.memory ?? this.opts.caller.memories;
    if (!caller) throw new Error("MemoryBrowserScreen requires caller.memory or caller.memories");
    return caller;
  }

  private get currentMemory(): TuiMemory | undefined {
    return this.filteredMemories[this.cursor];
  }

  private get facets(): Facet[] {
    const rows = this.memories.filter((memory) => !memory.archived);
    return [
      ...facetValues(rows, "kind", (memory) => memory.kind ?? "memory"),
      ...facetValues(rows, "importance", (memory) => memory.importance ?? "medium"),
      ...facetValues(rows, "source", (memory) => memory.source ?? "manual"),
      ...facetValues(rows, "project", (memory) => memory.projectId ?? (memory.global ? "global" : "none")),
    ];
  }

  private renderFacets(renderer: Renderer): void {
    renderer.writeln(c.bold("  Facets"));
    const facets = this.facets;
    if (facets.length === 0) {
      renderer.writeln(c.dim("  No facets."));
      return;
    }
    for (let i = 0; i < facets.length; i++) {
      const facet = facets[i]!;
      const active = this.selectedFacet?.group === facet.group && this.selectedFacet.value === facet.value;
      const marker = active ? "*" : " ";
      const line = `  ${marker} ${facet.group}: ${facet.value}`;
      renderer.writeln(this.focus === "facets" && i === this.facetCursor ? c.inverse(line) : line);
    }
  }

  private renderDetail(renderer: Renderer): void {
    const memory = this.currentMemory;
    renderer.writeln(c.bold("  Memory detail"));
    renderer.writeln();
    if (!memory) {
      renderer.writeln(c.dim("  No memory selected."));
      return;
    }
    renderer.infoRow("Key", memoryLabel(memory));
    renderer.infoRow("Kind", memory.kind ?? "memory");
    renderer.infoRow("Scope", memory.global ? "[global]" : "[project]");
    if (memory.importance) renderer.infoRow("Importance", memory.importance);
    if (memory.source) renderer.infoRow("Source", memory.source);
    if (memory.projectId) renderer.infoRow("Project", memory.projectId);
    if (memory.tags && memory.tags.length > 0) renderer.infoRow("Tags", memory.tags.join(", "));
    if (memory.links && memory.links.length > 0) {
      renderer.writeln();
      renderer.writeln(c.bold("  Linked entities"));
      for (const link of memory.links) renderer.writeln(`  ${link.targetKind}:${link.targetId}${link.label ? `  ${link.label}` : ""}`);
    }
    renderer.writeln();
    for (const line of memoryText(memory).split("\n")) renderer.writeln(`  ${line}`);
    renderer.writeln();
    renderer.writeln(c.dim("  g promote  q back"));
  }

  private renderEdit(renderer: Renderer): void {
    const memory = this.currentMemory;
    renderer.writeln(c.bold("  Edit memory"));
    renderer.writeln();
    if (!memory) {
      renderer.writeln(c.dim("  No memory selected."));
      return;
    }
    renderer.infoRow("Key", memoryLabel(memory));
    renderer.infoRow("Body", memoryText(memory));
    renderer.infoRow("Importance", memory.importance ?? "medium");
    renderer.infoRow("Tags", (memory.tags ?? []).join(", "));
    renderer.writeln();
    renderer.writeln(c.dim("  submitEdit({ body, importance, tags }) saves  q cancels"));
  }

  private async promoteCurrent(): Promise<void> {
    const memory = this.currentMemory;
    if (!memory || memory.global) return;
    await this.memoryCaller.promote({ id: memory.id });
    this.memories = this.memories.map((item) => item.id === memory.id ? { ...item, global: true } : item);
  }

  private async archiveCurrent(): Promise<void> {
    const memory = this.currentMemory;
    if (!memory) return;
    if (this.memoryCaller.archive) await this.memoryCaller.archive({ id: memory.id });
    this.memories = this.memories.map((item) => item.id === memory.id ? { ...item, archived: true } : item);
    this.clampCursor();
  }

  private async deleteCurrent(): Promise<void> {
    const memory = this.currentMemory;
    if (!memory) return;
    const deleteFn = this.memoryCaller.delete ?? this.memoryCaller.forget;
    if (deleteFn) await deleteFn({ id: memory.id });
    this.memories = this.memories.filter((item) => item.id !== memory.id);
    this.clampCursor();
  }

  private async runSearch(): Promise<void> {
    const query = this.searchQuery.trim();
    if (!query || !this.memoryCaller.search) return;
    this.memories = await this.memoryCaller.search({ ...this.baseInput(), query });
    this.cursor = 0;
    this.scrollTop = 0;
    this.clampCursor();
  }

  private baseInput(): Record<string, unknown> {
    return this.opts.projectId ? { projectId: this.opts.projectId } : {};
  }

  private matchesFacet(memory: TuiMemory): boolean {
    if (!this.selectedFacet) return true;
    const value = this.selectedFacet.value;
    if (this.selectedFacet.group === "kind") return (memory.kind ?? "memory") === value;
    if (this.selectedFacet.group === "importance") return (memory.importance ?? "medium") === value;
    if (this.selectedFacet.group === "source") return (memory.source ?? "manual") === value;
    return (memory.projectId ?? (memory.global ? "global" : "none")) === value;
  }

  private projectIdText(): string {
    return this.opts.projectId
      ? "  No memories for this project. Press r to run memory remember."
      : "  No memories. Press r to run memory remember.";
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.filteredMemories.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}

function facetValues(
  memories: TuiMemory[],
  group: Facet["group"],
  valueFor: (memory: TuiMemory) => string,
): Facet[] {
  return [...new Set(memories.map(valueFor))].sort().map((value) => ({ group, value }));
}

function memoryLabel(memory: TuiMemory): string {
  return memory.key || memory.kind || memory.id;
}

function memoryText(memory: TuiMemory): string {
  return memory.body ?? memory.content ?? "";
}
