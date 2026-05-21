/**
 * fulcrum my-work: show tasks assigned to current user.
 *
 * Usage:
 *   fulcrum my-work [--format json|table]
 *   fulcrum my-work --json
 *
 * Groups output: OVERDUE, DUE TODAY, THIS WEEK, LATER
 * Each row: task ID (FUL-42), title, project name, due date, priority icon
 */

import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface MyWorkRunOptions {
  caller?: {
    tasks: {
      myWork: AnyFn;
    };
  };
  env?: TaskApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

interface WorkTask {
  id: string;
  identifier?: string;
  title: string;
  projectName?: string;
  dueDate?: string | null;
  priority?: string | number | null;
  status?: string;
}

const PRIORITY_ICONS: Record<string, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  none: "⚪",
};

const HELP = `fulcrum my-work

Show tasks assigned to you.

Usage:
  fulcrum my-work [--format json|table]
  fulcrum my-work --json

Groups: OVERDUE, DUE TODAY, THIS WEEK, LATER
`;

export async function run(argv: readonly string[], opts: MyWorkRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;

  if (argv.includes("--help") || argv.includes("-h")) {
    print(HELP);
    return;
  }

  const jsonMode = argv.includes("--json");
  const formatIdx = argv.indexOf("--format");
  const format = jsonMode ? "json" : (formatIdx >= 0 ? (argv[formatIdx + 1] ?? "table") : "table");

  try {
    const caller = await resolveCaller(opts);
    const tasks: WorkTask[] = await caller.tasks.myWork({});

    if (format === "json") {
      print(JSON.stringify(tasks, null, 2));
      return;
    }

    if (tasks.length === 0) {
      print("No tasks assigned to you.");
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const groups: Record<string, WorkTask[]> = {
      "OVERDUE": [],
      "DUE TODAY": [],
      "THIS WEEK": [],
      "LATER": [],
    };

    for (const task of tasks) {
      if (!task.dueDate) {
        groups["LATER"]!.push(task);
        continue;
      }
      const due = new Date(task.dueDate);
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      if (dueDay < today) {
        groups["OVERDUE"]!.push(task);
      } else if (dueDay.getTime() === today.getTime()) {
        groups["DUE TODAY"]!.push(task);
      } else if (dueDay <= weekEnd) {
        groups["THIS WEEK"]!.push(task);
      } else {
        groups["LATER"]!.push(task);
      }
    }

    print("\nMy Work");
    print("─".repeat(70));

    for (const [group, groupTasks] of Object.entries(groups)) {
      if (groupTasks.length === 0) continue;
      print(`\n  ${group} (${groupTasks.length})`);
      for (const task of groupTasks) {
        const id = (task.identifier ?? task.id).padEnd(10);
        const priority = PRIORITY_ICONS[String(task.priority ?? "none")] ?? "⚪";
        const project = task.projectName ? ` [${task.projectName}]` : "";
        const due = task.dueDate ? ` ${task.dueDate}` : "";
        print(`    ${priority} ${id} ${task.title}${project}${due}`);
      }
    }
  } catch (err) {
    printErr(`fulcrum my-work: ${(err as Error).message}`);
    exit(1);
  }
}

async function resolveCaller(opts: MyWorkRunOptions): Promise<Required<MyWorkRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;

  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  const userId = opts.env?.FULCRUM_USER_ID ?? process.env["FULCRUM_USER_ID"];
  if (!apiCaller || !userId) {
    throw new Error(
      "Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return {
    tasks: {
      myWork: async () => {
        const tasks = await apiCaller.tasks.list({});
        return Array.isArray(tasks) ? tasks.filter((task) => isAssignedToUser(task, userId)) : [];
      },
    },
  };
}

function isAssignedToUser(task: unknown, userId: string): boolean {
  if (!task || typeof task !== "object") return false;
  const record = task as Record<string, unknown>;
  if (record.assigneeId === userId || record.assignee === userId) return true;
  const assignee = record.assignee;
  return !!assignee && typeof assignee === "object" && (assignee as Record<string, unknown>).id === userId;
}
