/**
 * fulcrum task hierarchy — task hierarchy commands.
 *
 * Usage:
 *   fulcrum task tree <taskId>              — display hierarchy tree
 *   fulcrum task list --type <type>         — filter by task type
 *   fulcrum task list --parent <parentId>   — show children only
 *   fulcrum task archive <taskId>           — archive task
 *   fulcrum task restore <taskId>           — restore archived task
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface TaskHierarchyRunOptions {
  caller?: {
    tasks: {
      tree: AnyFn;
      list?: AnyFn;
      archive?: AnyFn;
      restore?: AnyFn;
    };
  };
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

interface TreeNode {
  id: string;
  title: string;
  type: string;
  status: string;
  assignee: string | null;
  points: number | null;
  children: TreeNode[];
}

const TYPE_ICONS: Record<string, string> = {
  epic: "◆",
  task: "●",
  subtask: "○",
  bug: "⚠",
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? "●";
}

const HELP = `fulcrum task hierarchy

Hierarchy and task type commands.

Usage:
  fulcrum task tree <taskId>              Show hierarchy tree
  fulcrum task list --type <type>         Filter by type (epic|task|subtask|bug)
  fulcrum task list --parent <parentId>   Show children of parent
  fulcrum task archive <taskId>           Archive a task
  fulcrum task restore <taskId>           Restore archived task
`;

export async function run(argv: readonly string[], opts: TaskHierarchyRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub, ...rest] = argv;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    print(HELP);
    return;
  }

  if (sub === "tree") {
    const taskId = rest[0];
    if (!taskId) {
      printErr("fulcrum task tree: missing required argument <taskId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      const tree = await caller.tasks.tree({ taskId });
      renderTree(tree as TreeNode, "", true, print);
    } catch (err) {
      printErr(`fulcrum task tree: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "list") {
    const typeIdx = rest.indexOf("--type");
    const typeFilter = typeIdx >= 0 ? rest[typeIdx + 1] : undefined;
    const parentIdx = rest.indexOf("--parent");
    const parentId = parentIdx >= 0 ? rest[parentIdx + 1] : undefined;
    const showArchived = rest.includes("--archived");

    try {
      const caller = await resolveCaller(opts);
      if (!caller.tasks.list) {
        print("(task list not available in this context)");
        return;
      }
      const tasks = await caller.tasks.list({ type: typeFilter, parentId, includeArchived: showArchived });
      if (!Array.isArray(tasks) || tasks.length === 0) {
        print("  (no tasks)");
        return;
      }
      print("\n  ID              Type     Status       Title");
      print("  " + "─".repeat(70));
      for (const task of tasks) {
        const icon = getIcon(task.type ?? "task");
        const id = String(task.identifier ?? task.id ?? "").padEnd(14);
        const type = String(task.type ?? "task").padEnd(8);
        const status = String(task.status ?? "").padEnd(12);
        print(`  ${id}  ${icon} ${type} ${status} ${task.title ?? ""}`);
      }
    } catch (err) {
      printErr(`fulcrum task list: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "archive") {
    const taskId = rest[0];
    if (!taskId) {
      printErr("fulcrum task archive: missing <taskId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      if (!caller.tasks.archive) {
        printErr("archive procedure unavailable");
        exit(1);
        return;
      }
      await caller.tasks.archive({ taskIds: [taskId] });
      print(`Archived task ${taskId}`);
    } catch (err) {
      printErr(`fulcrum task archive: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  if (sub === "restore") {
    const taskId = rest[0];
    if (!taskId) {
      printErr("fulcrum task restore: missing <taskId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      if (!caller.tasks.restore) {
        printErr("restore procedure unavailable");
        exit(1);
        return;
      }
      await caller.tasks.restore({ taskIds: [taskId] });
      print(`Restored task ${taskId}`);
    } catch (err) {
      printErr(`fulcrum task restore: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  printErr(`fulcrum task: unknown hierarchy subcommand '${sub}'`);
  print(HELP);
  exit(2);
}

function renderTree(node: TreeNode, prefix: string, isLast: boolean, print: (line: string) => void): void {
  const connector = prefix === "" ? "" : (isLast ? "└── " : "├── ");
  const icon = getIcon(node.type);
  const pts = node.points != null ? ` (${node.points}pt)` : "";
  const assignee = node.assignee ? ` @${node.assignee}` : "";
  const done = node.status === "done" || node.status === "completed" ? " ✓" : "";
  print(`${prefix}${connector}${icon} ${node.title} [${node.type}]${pts}${assignee}${done}`);

  const childPrefix = prefix + (prefix === "" ? "" : (isLast ? "    " : "│   "));
  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    renderTree(children[i]!, childPrefix, i === children.length - 1, print);
  }
}

async function resolveCaller(opts: TaskHierarchyRunOptions): Promise<Required<TaskHierarchyRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");
  const { MikroORM } = await import("@mikro-orm/postgresql");
  const { Container } = await import("@needle-di/core");
  const { registerDbBindings } = await import("../../db/db.module.ts");

  const orm = new MikroORM({} as never);
  const container = new Container();
  container.bind({ provide: MikroORM, useValue: orm });
  const em = orm.em.fork();
  registerDbBindings(container, orm, em);

  const ctx = createContext({ session: null as never, orgId: "", userId: "", em, container });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as Required<TaskHierarchyRunOptions>["caller"];
}
