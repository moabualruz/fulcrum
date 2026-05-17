/**
 * Palette — Cmd+K / Ctrl+K command palette overlay.
 *
 * Modes:
 *   - Search mode (default): fuzzy-filter items by query text
 *   - Command mode: query starts with ">" — matches command names
 *   - Filter token: "kind:X" → filters items starting with "X."
 */

import pc from "picocolors";

/** Sequential character fuzzy match. */
function fuzzyMatch(needle: string, haystack: string): boolean {
  let pos = 0;
  for (const ch of needle) {
    const idx = haystack.indexOf(ch, pos);
    if (idx === -1) return false;
    pos = idx + 1;
  }
  return true;
}

export interface PaletteOpts {
  width: number;
  height: number;
  items: string[];
  onAction?: (action: string) => void;
}

export class Palette {
  private readonly width: number;
  private readonly height: number;
  private readonly items: string[];
  private readonly onAction?: (action: string) => void;

  private query = "";
  private _isOpen = false;
  private _selectedIdx = 0;

  constructor(opts: PaletteOpts) {
    this.width = opts.width;
    this.height = opts.height;
    this.items = opts.items;
    this.onAction = opts.onAction;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(): void {
    this._isOpen = true;
    this.query = "";
    this._selectedIdx = 0;
  }

  close(): void {
    this._isOpen = false;
    this.query = "";
  }

  setQuery(q: string): void {
    this.query = q;
    this._selectedIdx = 0;
  }

  handleKey(key: string): void {
    if (key === "escape") {
      this.close();
    } else if (key === "enter") {
      this.selectCurrent();
    } else if (key === "up") {
      this._selectedIdx = Math.max(0, this._selectedIdx - 1);
    } else if (key === "down") {
      const max = this.filteredItems().length - 1;
      this._selectedIdx = Math.min(max, this._selectedIdx + 1);
    }
  }

  /** Get filtered items based on current query. */
  filteredItems(): string[] {
    const q = this.query.trim();
    if (!q) return this.items;

    // Filter token: "kind:X" → items starting with "X."
    const kindMatch = q.match(/^kind:(\S+)$/);
    if (kindMatch) {
      const prefix = kindMatch[1]! + ".";
      return this.items.filter((item) => item.startsWith(prefix));
    }

    // Command mode: ">text" → strip > and fuzzy match
    const searchText = q.startsWith(">") ? q.slice(1) : q;

    // Fuzzy match: try sequential char match on item and on
    // reversed-segment form (e.g. "create-task" matches "task.create")
    return this.items.filter((item) => {
      const lower = item.toLowerCase();
      const needle = searchText.toLowerCase().replace(/-/g, "");
      // Also try reversed segments: "createtask" → try "task.create" form
      const reversedItem = lower.split(".").reverse().join("");
      return fuzzyMatch(needle, lower) || fuzzyMatch(needle, reversedItem);
    });
  }

  /** Select currently highlighted item, fire onAction. */
  selectCurrent(): void {
    const matches = this.filteredItems();
    const item = matches[this._selectedIdx];
    if (item && this.onAction) {
      this.onAction(item);
    }
  }

  /** Render palette overlay as lines. */
  render(): string[] {
    if (!this._isOpen) return [];

    const lines: string[] = [];
    const inner = this.width - 4;
    lines.push("┌" + "─".repeat(inner + 2) + "┐");
    lines.push("│ " + pc.bold("> " + this.query).padEnd(inner) + " │");
    lines.push("│" + "─".repeat(inner + 2) + "│");

    const matches = this.filteredItems();
    const maxVisible = Math.min(matches.length, this.height - 6);
    for (let i = 0; i < maxVisible; i++) {
      const item = matches[i]!;
      const prefix = i === this._selectedIdx ? pc.cyan("▸ ") : "  ";
      const text = (prefix + item).slice(0, inner);
      lines.push("│ " + text.padEnd(inner) + " │");
    }

    lines.push("└" + "─".repeat(inner + 2) + "┘");
    return lines;
  }
}
