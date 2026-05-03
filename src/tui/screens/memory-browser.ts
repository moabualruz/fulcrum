import type { Renderer } from "../renderer.ts";
import { c, truncate } from "../renderer.ts";

export interface TuiMemory {
  id: string;
  projectId?: string | null;
  kind?: string;
  key?: string | null;
  body?: string;
  content?: string;
  tags?: string[];
  importance?: string;
  global?: boolean;
  updatedAt?: string | Date | null;
}

export interface MemoryBrowserScreenOptions {
  projectId?: string;
  caller: {
    memories: {
      list: (input?: Record<string, unknown>) => Promise<TuiMemory[]>;
      promote: (input: { id: string }) => Promise<unknown>;
    };
  };
}

type Mode = "list" | "detail";

export class MemoryBrowserScreen {
  private memories: TuiMemory[] = [];
  private cursor = 0;
  private globalOnly = false;
  private searchQuery = "";
  private searchOpen = false;
  private mode: Mode = "list";

  constructor(private readonly opts: MemoryBrowserScreenOptions) {}

  async load(): Promise<void> {
    this.memories = await this.opts.caller.memories.list(this.opts.projectId ? { projectId: this.opts.projectId } : {});
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

    const filterText = this.globalOnly ? "Global only" : "Project + global";
    renderer.writeln(`  ${filterText}${this.searchOpen ? `  Search: ${this.searchQuery}` : ""}`);
    renderer.writeln();

    const rows = this.visibleMemories;
    if (rows.length === 0) {
      renderer.writeln(c.dim("  No memories."));
    }

    for (let i = 0; i < rows.length; i++) {
      const memory = rows[i]!;
      const selected = i === this.cursor;
      const badge = memory.global ? " [global]" : " [project]";
      const line = `  ${memoryLabel(memory)}${badge}  ${truncate(memoryText(memory), Math.max(24, renderer.width - 42))}`;
      renderer.writeln(selected ? c.inverse(line) : line);
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k move  g global filter  / search  Enter detail  p promote"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.mode === "detail") {
      if (key === "q" || key === "\x1b") {
        this.mode = "list";
        return true;
      }
      if (key === "p") {
        await this.promoteCurrent();
        return true;
      }
      return false;
    }

    if (key === "g") {
      this.globalOnly = !this.globalOnly;
      this.cursor = 0;
      this.clampCursor();
      return true;
    }
    if (key === "/") {
      this.searchOpen = true;
      return true;
    }
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.visibleMemories.length - 1));
      return true;
    }
    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (key === "\r" || key === "\n") {
      if (!this.currentMemory) return false;
      this.mode = "detail";
      return true;
    }
    if (key === "p") {
      await this.promoteCurrent();
      return true;
    }
    return false;
  }

  setSearchQuery(query: string): void {
    this.searchOpen = true;
    this.searchQuery = query;
    this.cursor = 0;
    this.clampCursor();
  }

  get visibleMemories(): TuiMemory[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.memories
      .filter((memory) => !this.globalOnly || memory.global)
      .filter((memory) => {
        if (!query) return true;
        return [memoryLabel(memory), memoryText(memory), ...(memory.tags ?? [])].join(" ").toLowerCase().includes(query);
      });
  }

  private get currentMemory(): TuiMemory | undefined {
    return this.visibleMemories[this.cursor];
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
    if (memory.tags && memory.tags.length > 0) renderer.infoRow("Tags", memory.tags.join(", "));
    renderer.writeln();
    for (const line of memoryText(memory).split("\n")) renderer.writeln(`  ${line}`);
    renderer.writeln();
    renderer.writeln(c.dim("  p promote  q back"));
  }

  private async promoteCurrent(): Promise<void> {
    const memory = this.currentMemory;
    if (!memory || memory.global) return;
    await this.opts.caller.memories.promote({ id: memory.id });
    this.memories = this.memories.map((item) => item.id === memory.id ? { ...item, global: true } : item);
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.visibleMemories.length - 1));
  }
}

function memoryLabel(memory: TuiMemory): string {
  return memory.key || memory.kind || memory.id;
}

function memoryText(memory: TuiMemory): string {
  return memory.body ?? memory.content ?? "";
}
