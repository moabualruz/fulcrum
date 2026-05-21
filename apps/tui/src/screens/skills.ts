/**
 * TUI skills browser screen: table + conflict panel.
 *
 * P5#18: renders skills table with slug/version/source/hash_verified/enabled_agents.
 * Key bindings: s=sync, u=upgrade, D=uninstall(confirm), k=keep-local, U=use-upstream, m=editor merge.
 * Conflict panel: side-by-side diff when selected row has upstream_conflict.
 */

import type { Renderer } from "../renderer.ts";
import { c, pad } from "../renderer.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TuiSkillRow {
  slug: string;
  version: string;
  source: string;
  hashVerified: boolean;
  enabledAgents: string[];
  upstreamConflict: string | null;
}

export interface SkillsScreenOptions {
  caller: {
    skills: {
      list: () => Promise<TuiSkillRow[]>;
      sync: (input: { fetchUpstream: boolean }) => Promise<{ merged: number }>;
      upgrade: (input: { slug: string }) => Promise<{ slug: string; version: string }>;
      uninstall: (input: { slug: string }) => Promise<{ ok: boolean }>;
      resolveConflict: (input: { slug: string; resolution: "local" | "upstream" | "editor" }) => Promise<{ ok: boolean }>;
    };
  };
  viewportRows?: number;
}

type Overlay = "none" | "confirm-uninstall";

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export class SkillsScreen {
  private skills: TuiSkillRow[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: Overlay = "none";
  private statusMessage: string | null = null;

  constructor(private readonly opts: SkillsScreenOptions) {}

  async load(): Promise<void> {
    this.skills = await this.opts.caller.skills.list();
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Skills"));
    renderer.separator();
    renderer.writeln();

    if (this.skills.length === 0) {
      renderer.writeln(c.dim("  No skills installed."));
    } else {
      this.renderTable(renderer);
    }

    // Conflict panel
    const selected = this.selectedSkill;
    if (selected?.upstreamConflict) {
      renderer.writeln();
      renderer.writeln(c.bold(c.yellow("  Conflict")));
      renderer.separator();
      this.renderConflictPanel(renderer, selected.upstreamConflict);
    }

    // Overlay
    if (this.overlay === "confirm-uninstall" && selected) {
      renderer.writeln();
      renderer.writeln(c.bold(c.red(`  Uninstall "${selected.slug}"? (y/n) confirm`)));
    }

    // Status
    if (this.statusMessage) {
      renderer.writeln();
      renderer.writeln(c.green(`  ${this.statusMessage}`));
    }

    renderer.writeln();
    const hasConflict = !!selected?.upstreamConflict;
    const hints = hasConflict
      ? "  j/k navigate  s sync  u upgrade  D uninstall  k keep-local  U use-upstream  m editor"
      : "  j/k navigate  s sync  u upgrade  D uninstall";
    renderer.writeln(c.dim(hints));
  }

  async handleKey(key: string): Promise<boolean> {
    // Confirm overlay intercepts
    if (this.overlay === "confirm-uninstall") {
      if (key === "y") {
        const skill = this.selectedSkill;
        if (skill) {
          await this.opts.caller.skills.uninstall({ slug: skill.slug });
          await this.load();
        }
        this.overlay = "none";
        return true;
      }
      if (key === "n" || key === "\x1b") {
        this.overlay = "none";
        return true;
      }
      return false;
    }

    // Navigation
    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.skills.length - 1));
      this.keepCursorVisible();
      return true;
    }
    if (key === "k" && !this.selectedSkill?.upstreamConflict) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }
    if (key === "\x1b[A") {
      this.cursor = Math.max(0, this.cursor - 1);
      this.keepCursorVisible();
      return true;
    }

    // Sync
    if (key === "s") {
      const result = await this.opts.caller.skills.sync({ fetchUpstream: true });
      this.statusMessage = `${result.merged} merged`;
      await this.load();
      return true;
    }

    // Upgrade
    if (key === "u") {
      const skill = this.selectedSkill;
      if (!skill) return false;
      const result = await this.opts.caller.skills.upgrade({ slug: skill.slug });
      skill.version = result.version;
      return true;
    }

    // Uninstall (with confirm)
    if (key === "D") {
      if (!this.selectedSkill) return false;
      this.overlay = "confirm-uninstall";
      return true;
    }

    // Conflict resolution keys: only when selected row has conflict
    const selected = this.selectedSkill;
    if (selected?.upstreamConflict) {
      if (key === "k") {
        await this.opts.caller.skills.resolveConflict({ slug: selected.slug, resolution: "local" });
        selected.upstreamConflict = null;
        return true;
      }
      if (key === "U") {
        await this.opts.caller.skills.resolveConflict({ slug: selected.slug, resolution: "upstream" });
        selected.upstreamConflict = null;
        return true;
      }
      if (key === "m") {
        await this.opts.caller.skills.resolveConflict({ slug: selected.slug, resolution: "editor" });
        selected.upstreamConflict = null;
        return true;
      }
    }

    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Private rendering
  // ───────────────────────────────────────────────────────────────────────────

  private renderTable(renderer: Renderer): void {
    const rows = this.opts.viewportRows ?? 20;
    const visible = this.skills.slice(this.scrollTop, this.scrollTop + rows);

    for (const skill of visible) {
      const index = this.skills.indexOf(skill);
      const pointer = index === this.cursor ? c.bold(">") : " ";
      const hash = skill.hashVerified ? c.green("ok") : c.red("!!");
      const agents = skill.enabledAgents.join(", ");
      const line = `${pointer} ${pad(skill.slug, 20)} ${pad(skill.version, 10)} ${pad(skill.source, 12)} ${hash}  ${agents}`;
      renderer.writeln(line);
    }
  }

  private renderConflictPanel(renderer: Renderer, diff: string): void {
    const lines = diff.split("\n");
    for (const line of lines) {
      if (line.startsWith("-")) {
        renderer.writeln(`  ${c.red(line)}`);
      } else if (line.startsWith("+")) {
        renderer.writeln(`  ${c.green(line)}`);
      } else {
        renderer.writeln(`  ${line}`);
      }
    }
  }

  private get selectedSkill(): TuiSkillRow | undefined {
    return this.skills[this.cursor];
  }

  private clampCursor(): void {
    this.cursor = Math.min(this.cursor, Math.max(0, this.skills.length - 1));
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}
