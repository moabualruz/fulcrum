import type { Renderer } from "../renderer.ts";
import { c } from "../renderer.ts";

export interface ProjectListItem {
  id: string;
  name: string;
  slug: string;
  status?: string | null;
  updatedAt?: string | Date | null;
}

export interface ProjectsScreenOptions {
  caller: {
    projects: {
      list: () => Promise<ProjectListItem[]>;
      create: (input: { name: string }) => Promise<ProjectListItem>;
      delete: (input: { id: string }) => Promise<{ ok: boolean }>;
    };
  };
  onNavigateProject?: (id: string) => void;
  viewportRows?: number;
}

type Overlay = "none" | "create" | "confirm-delete";

export class ProjectsScreen {
  private projects: ProjectListItem[] = [];
  private cursor = 0;
  private scrollTop = 0;
  private overlay: Overlay = "none";

  constructor(private readonly opts: ProjectsScreenOptions) {}

  async load(): Promise<void> {
    this.projects = await this.opts.caller.projects.list();
    this.cursor = Math.min(this.cursor, Math.max(0, this.projects.length - 1));
    this.keepCursorVisible();
  }

  render(renderer: Renderer): void {
    renderer.writeln();
    renderer.writeln(c.bold("  Projects"));
    renderer.separator();
    renderer.writeln();

    if (this.projects.length === 0) {
      renderer.writeln(c.dim("  No projects."));
    } else {
      for (const project of this.visibleProjects) {
        const index = this.projects.indexOf(project);
        const prefix = index === this.cursor ? c.bold("> ") : "  ";
        renderer.writeln(`${prefix}${project.name}  ${c.dim(project.slug)}  ${project.status ?? "active"}`);
      }
    }

    renderer.writeln();
    renderer.writeln(c.dim("  j/k navigate  c create  Enter open  d delete  q back"));

    if (this.overlay === "create") {
      renderer.writeln();
      renderer.writeln(c.bold("  Create project"));
      renderer.writeln(c.dim("  Enter name to create."));
    }

    if (this.overlay === "confirm-delete") {
      renderer.writeln();
      renderer.writeln(c.yellow("  Confirm? [y/N]"));
    }
  }

  async handleKey(key: string): Promise<boolean> {
    if (this.overlay === "confirm-delete") {
      if (key === "y" || key === "Y") {
        await this.deleteCurrent();
        return true;
      }
      if (key === "n" || key === "N" || key === "q" || key === "\x1b") {
        this.overlay = "none";
        return true;
      }
      return false;
    }

    if (key === "j" || key === "\x1b[B") {
      this.cursor = Math.min(this.cursor + 1, Math.max(0, this.projects.length - 1));
      this.keepCursorVisible();
      return true;
    }

    if (key === "k" || key === "\x1b[A") {
      this.cursor = Math.max(this.cursor - 1, 0);
      this.keepCursorVisible();
      return true;
    }

    if (key === "c") {
      this.overlay = "create";
      return true;
    }

    if (key === "d") {
      if (this.projects.length === 0) return false;
      this.overlay = "confirm-delete";
      return true;
    }

    if (key === "\r" || key === "\n") {
      const project = this.projects[this.cursor];
      if (!project) return false;
      this.opts.onNavigateProject?.(project.id);
      return true;
    }

    return false;
  }

  async submitCreate(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = await this.opts.caller.projects.create({ name: trimmed });
    this.projects = [...this.projects, project];
    this.cursor = this.projects.length - 1;
    this.overlay = "none";
    this.keepCursorVisible();
  }

  get visibleProjects(): readonly ProjectListItem[] {
    const rows = this.opts.viewportRows ?? 20;
    return this.projects.slice(this.scrollTop, this.scrollTop + rows);
  }

  get cursorIndex(): number {
    return this.cursor;
  }

  private async deleteCurrent(): Promise<void> {
    const project = this.projects[this.cursor];
    if (!project) return;
    await this.opts.caller.projects.delete({ id: project.id });
    this.projects = this.projects.filter((item) => item.id !== project.id);
    this.cursor = Math.min(this.cursor, Math.max(0, this.projects.length - 1));
    this.overlay = "none";
    this.keepCursorVisible();
  }

  private keepCursorVisible(): void {
    const rows = this.opts.viewportRows ?? 20;
    if (this.cursor < this.scrollTop) this.scrollTop = this.cursor;
    if (this.cursor >= this.scrollTop + rows) this.scrollTop = this.cursor - rows + 1;
  }
}
