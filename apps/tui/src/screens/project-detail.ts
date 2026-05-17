import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";
import type { ProjectListItem } from "./projects.ts";

const PROJECT_DETAIL_TABS = ["board", "list", "sprints", "reports", "repos", "docs"] as const;

export type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number];

export interface ProjectDetailScreenOptions {
  project: ProjectListItem;
}

export class ProjectDetailScreen {
  private tabIndex = 0;
  private readonly scrollByTab: Record<ProjectDetailTab, number> = {
    board: 0,
    list: 0,
    sprints: 0,
    reports: 0,
    repos: 0,
    docs: 0,
  };

  constructor(private readonly opts: ProjectDetailScreenOptions) {}

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold(`  Project › ${this.opts.project.name}`));
    renderer.writeln(`  Project ID: ${this.opts.project.id}  Slug: ${this.opts.project.slug}`);
    if (this.opts.project.repo) {
      renderer.writeln(`  Repo: ${this.opts.project.repo.id}  ${this.opts.project.repo.localPath ?? "No local repo linked"}  ${this.opts.project.repo.syncStatus ?? "unknown"}`);
    }
    if (this.opts.project.workflow) {
      renderer.writeln(`  Workflow: ${this.opts.project.workflow.id}`);
    }
    renderer.separator();
    renderer.writeln();
    renderer.writeln(`  ${PROJECT_DETAIL_TABS.map((tab) => this.formatTab(tab)).join("  ")}`);
    renderer.writeln();
    renderer.writeln(`  ${this.activeTab} view`);
    renderer.writeln(`  Scroll: ${this.scrollFor(this.activeTab)}`);
    renderer.writeln();
    renderer.writeln(c.dim("  1-6 switch tabs  Tab next  j/k scroll  q back"));
  }

  async handleKey(key: string): Promise<boolean> {
    if (/^[1-6]$/.test(key)) {
      this.tabIndex = Number(key) - 1;
      return true;
    }

    if (key === "\t") {
      this.tabIndex = (this.tabIndex + 1) % PROJECT_DETAIL_TABS.length;
      return true;
    }

    if (key === "j" || key === "\x1b[B") {
      this.scrollByTab[this.activeTab] += 1;
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.scrollByTab[this.activeTab] = Math.max(0, this.scrollByTab[this.activeTab] - 1);
      return true;
    }

    return false;
  }

  get activeTab(): ProjectDetailTab {
    return PROJECT_DETAIL_TABS[this.tabIndex] ?? "board";
  }

  scrollFor(tab: ProjectDetailTab): number {
    return this.scrollByTab[tab];
  }

  private formatTab(tab: ProjectDetailTab): string {
    return tab === this.activeTab ? c.inverse(`[${tab}]`) : tab;
  }
}
