import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface TuiActivityEvent {
  id: string;
  subjectKind: string;
  verb: string;
  actor?: string | null;
  subjectId?: string | null;
  createdAt: string | Date;
}

export interface ActivityQueryResult {
  items: TuiActivityEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivityFeedFilters {
  subjectKind?: string;
  verb?: string;
  userId?: string;
}

export interface ActivityFeedScreenOptions {
  caller: {
    audit: {
      query: (input: ActivityFeedFilters & { limit?: number; offset?: number }) => Promise<ActivityQueryResult>;
    };
  };
  filterChips?: {
    kind?: string[];
    verb?: string[];
    actor?: string[];
  };
}

type ChipGroup = "kind" | "verb" | "actor";

const GROUPS: ChipGroup[] = ["kind", "verb", "actor"];

export class ActivityFeedScreen {
  private rows: TuiActivityEvent[] = [];
  private activeGroup = 0;
  private activeChip = 0;
  private filters: ActivityFeedFilters = {};

  constructor(private readonly opts: ActivityFeedScreenOptions) {}

  async load(): Promise<void> {
    await this.reload();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Activity feed"));
    renderer.separator();
    renderer.writeln(`  ${this.renderChips()}`);
    renderer.writeln();

    if (this.rows.length === 0) {
      renderer.writeln(c.dim("  No activity events."));
    } else {
      for (const row of this.rows) {
        renderer.writeln(
          `  ${row.subjectKind} ${row.verb} ${row.actor ?? "system"} ${row.subjectId ?? row.id} ${formatDate(row.createdAt)}`,
        );
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  Tab filter group  Space apply chip  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (key === "\t") {
      const chips = this.currentChips;
      if (chips.length > 1) {
        this.activeChip = (this.activeChip + 1) % chips.length;
      } else {
        this.activeGroup = (this.activeGroup + 1) % GROUPS.length;
        this.activeChip = 0;
      }
      return true;
    }

    if (key === "j" || key === "\x1b[C") {
      this.activeChip = Math.min(this.activeChip + 1, this.currentChips.length - 1);
      return true;
    }

    if (key === "k" || key === "\x1b[D") {
      this.activeChip = Math.max(0, this.activeChip - 1);
      return true;
    }

    if (key === " ") {
      const chip = this.currentChips[this.activeChip];
      const group = GROUPS[this.activeGroup];
      if (!chip || !group) return false;
      if (group === "kind") this.filters.subjectKind = chip;
      if (group === "verb") this.filters.verb = chip;
      if (group === "actor") this.filters.userId = chip;
      await this.reload();
      return true;
    }

    return false;
  }

  private get currentChips(): string[] {
    const group = GROUPS[this.activeGroup] ?? "kind";
    return this.opts.filterChips?.[group] ?? [];
  }

  private async reload(): Promise<void> {
    const result = await this.opts.caller.audit.query({ ...this.filters, limit: 50, offset: 0 });
    this.rows = result.items;
  }

  private renderChips(): string {
    return GROUPS.map((group, groupIndex) => {
      const chips = this.opts.filterChips?.[group] ?? [];
      const rendered = chips.map((chip, chipIndex) => {
        const active = groupIndex === this.activeGroup && chipIndex === this.activeChip;
        const selected = this.isSelected(group, chip);
        const label = selected ? `[${chip}]` : chip;
        return active ? c.inverse(label) : label;
      }).join(" ");
      return `${group}: ${rendered || c.dim("*")}`;
    }).join("   ");
  }

  private isSelected(group: ChipGroup, chip: string): boolean {
    if (group === "kind") return this.filters.subjectKind === chip;
    if (group === "verb") return this.filters.verb === chip;
    return this.filters.userId === chip;
  }
}

function formatDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
