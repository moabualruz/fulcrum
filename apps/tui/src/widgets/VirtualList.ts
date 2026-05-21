/**
 * VirtualList: renders a window of items from a large list.
 * Only renders visibleRows items at a time for <16ms/frame performance.
 */

export interface VirtualListOpts<T> {
  items: T[];
  visibleRows: number;
  renderItem: (item: T, index: number) => string;
  onSelect?: (item: T, index: number) => void;
}

export class VirtualList<T = string> {
  private readonly items: T[];
  private readonly visibleRows: number;
  private readonly renderItem: (item: T, index: number) => string;
  private readonly onSelect?: (item: T, index: number) => void;

  selectedIndex = 0;
  private scrollOffset = 0;

  constructor(opts: VirtualListOpts<T>) {
    this.items = opts.items;
    this.visibleRows = opts.visibleRows;
    this.renderItem = opts.renderItem;
    this.onSelect = opts.onSelect;
  }

  /** Scroll so the last item is visible. */
  scrollToEnd(): void {
    this.selectedIndex = this.items.length - 1;
    this.scrollOffset = Math.max(0, this.items.length - this.visibleRows);
  }

  /** Move selection down. */
  moveDown(): void {
    if (this.selectedIndex < this.items.length - 1) {
      this.selectedIndex++;
      if (this.selectedIndex >= this.scrollOffset + this.visibleRows) {
        this.scrollOffset++;
      }
    }
  }

  /** Move selection up. */
  moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      if (this.selectedIndex < this.scrollOffset) {
        this.scrollOffset--;
      }
    }
  }

  /** Fire select callback for current item. */
  select(): void {
    const item = this.items[this.selectedIndex];
    if (item !== undefined && this.onSelect) {
      this.onSelect(item, this.selectedIndex);
    }
  }

  /** Render visible window: returns exactly visibleRows lines. */
  render(): string[] {
    const end = Math.min(this.scrollOffset + this.visibleRows, this.items.length);
    const lines: string[] = [];
    for (let i = this.scrollOffset; i < end; i++) {
      const item = this.items[i]!;
      const prefix = i === this.selectedIndex ? "▸ " : "  ";
      lines.push(prefix + this.renderItem(item, i));
    }
    // Pad to visibleRows if items shorter
    while (lines.length < this.visibleRows) {
      lines.push("");
    }
    return lines.slice(0, this.visibleRows);
  }
}
