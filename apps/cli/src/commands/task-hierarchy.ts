/**
 * fulcrum task hierarchy: task hierarchy commands.
 *
 * Usage:
 *   fulcrum task tree <taskId>             : display hierarchy tree
 *   fulcrum task list --type <type>        : filter by task type
 *   fulcrum task list --parent <parentId>  : show children only
 *   fulcrum task archive <taskId>          : archive task
 *   fulcrum task restore <taskId>          : restore archived task
 */

import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

interface TaskHierarchyCaller {
  tasks: {
    tree?: AnyFn;
    get?: AnyFn;
    list?: AnyFn;
    listChildren?: AnyFn;
    manualWorkbench?: AnyFn;
    archive?: AnyFn;
    restore?: AnyFn;
    delete?: AnyFn;
  };
}

export interface TaskHierarchyRunOptions {
  caller?: TaskHierarchyCaller;
  env?: TaskApiEnvironment;
  fetch?: typeof fetch;
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
      const tree = caller.tasks.tree
        ? await caller.tasks.tree({ taskId })
        : await buildTreeFromTaskApi(caller, taskId);
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
      if (!caller.tasks.list && !caller.tasks.manualWorkbench) {
        print("(task list not available in this context)");
        return;
      }
      const tasks = await listTasks(caller, { type: typeFilter, parentId, includeArchived: showArchived });
      if (!Array.isArray(tasks) || tasks.length === 0) {
        print("  (no tasks)");
        return;
      }
      print("\n  ID              Type     Status       Title");
      print("  " + "─".repeat(70));
      for (const task of tasks) {
        const record = task as Record<string, unknown>;
        const taskType = String(record.type ?? record.taskType ?? "task");
        const icon = getIcon(taskType);
        const id = String(record.identifier ?? record.id ?? "").padEnd(14);
        const type = taskType.padEnd(8);
        const status = String(record.status ?? "").padEnd(12);
        print(`  ${id}  ${icon} ${type} ${status} ${record.title ?? ""}`);
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
      if (!caller.tasks.archive && !caller.tasks.delete) {
        printErr("archive procedure unavailable");
        exit(1);
        return;
      }
      if (caller.tasks.archive) {
        await caller.tasks.archive({ taskIds: [taskId] });
      } else {
        await caller.tasks.delete!({ id: taskId });
      }
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

async function resolveCaller(opts: TaskHierarchyRunOptions): Promise<TaskHierarchyCaller> {
  if (opts.caller) return opts.caller;

  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return {
    tasks: {
      get: apiCaller.tasks.get,
      list: apiCaller.tasks.list,
      listChildren: apiCaller.tasks.listChildren,
      manualWorkbench: apiCaller.tasks.manualWorkbench,
      delete: apiCaller.tasks.delete,
    } as TaskHierarchyCaller["tasks"],
  };
}

async function buildTreeFromTaskApi(caller: TaskHierarchyCaller, taskId: string): Promise<TreeNode> {
  if (!caller.tasks.get || !caller.tasks.listChildren) {
    throw new Error("task tree requires task get and children API methods");
  }
  const task = taskNode(await caller.tasks.get({ id: taskId }));
  const children = await caller.tasks.listChildren({ id: taskId });
  task.children = await Promise.all((Array.isArray(children) ? children : [])
    .map((child) => String((child as { id?: string }).id ?? ""))
    .filter(Boolean)
    .map((id) => buildTreeFromTaskApi(caller, id)));
  return task;
}

async function listTasks(
  caller: TaskHierarchyCaller,
  input: { type?: string; parentId?: string; includeArchived: boolean },
): Promise<unknown[]> {
  if (caller.tasks.manualWorkbench) {
    const workbench = await caller.tasks.manualWorkbench({
      viewMode: "list",
      filters: input.type ? { taskTypes: [input.type] } : {},
    });
    const rows = Array.isArray((workbench as { listRows?: unknown[] })?.listRows)
      ? (workbench as { listRows: unknown[] }).listRows
      : [];
    return rows.filter((row) => {
      const record = row as { parentId?: string | null; deletedAt?: string | null };
      if (input.parentId && record.parentId !== input.parentId) return false;
      return input.includeArchived || !record.deletedAt;
    });
  }
  if (!caller.tasks.list) return [];
  return await caller.tasks.list({
    type: input.type,
    parentId: input.parentId,
    includeArchived: input.includeArchived,
  });
}

function taskNode(value: unknown): TreeNode {
  const record = value as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    title: String(record.title ?? ""),
    type: String(record.type ?? record.taskType ?? "task"),
    status: String(record.status ?? ""),
    assignee: typeof record.assignee === "string"
      ? record.assignee
      : typeof record.assigneeId === "string"
        ? record.assigneeId
        : null,
    points: typeof record.points === "number" ? record.points : null,
    children: [],
  };
}
