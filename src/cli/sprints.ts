import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { applyProductMigrations } from "../db/product-migrations.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import {
  addTaskToSprint,
  removeTaskFromSprint,
} from "../product-kernel/store/repositories.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";

const HELP = `fulcrum sprints — sprint planning commands

Usage:
  fulcrum sprints add-task --sprint-id <id> --task-id <id> [--json]
  fulcrum sprints remove-task --sprint-id <id> --task-id <id> [--json]
`;

const BOOLEAN_FLAGS = new Set<string>(["--json"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[token] = next;
        i += 1;
        continue;
      }
      flags[token] = true;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

async function openDb(): Promise<ProductDb> {
  const dir = productDbDir();
  await mkdir(dir, { recursive: true });
  const db = await openPglite(join(dir, "main"));
  await applyProductMigrations(db);
  return db;
}

export async function run(argv: readonly string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help") {
    console.log(HELP);
    return;
  }

  switch (verb) {
    case "add-task":
      return runAddTask(rest);
    case "remove-task":
      return runRemoveTask(rest);
    default:
      console.error(`fulcrum sprints: unknown verb '${verb}'`);
      console.error(HELP);
      process.exit(2);
  }
}

async function runAddTask(argv: readonly string[]): Promise<void> {
  const { flags } = parseArgs(argv);
  const sprintId = flags["--sprint-id"];
  const taskId = flags["--task-id"];
  const json = flags["--json"] === true;

  if (typeof sprintId !== "string" || typeof taskId !== "string") {
    console.error("usage: fulcrum sprints add-task --sprint-id <id> --task-id <id>");
    process.exit(2);
  }

  const db = await openDb();
  try {
    await addTaskToSprint(db, { sprintId, taskId });
    if (json) {
      console.log(JSON.stringify({ ok: true, sprintId, taskId }));
    } else {
      console.log(`task ${taskId} added to sprint ${sprintId}`);
    }
  } finally {
    await db.close();
  }
}

async function runRemoveTask(argv: readonly string[]): Promise<void> {
  const { flags } = parseArgs(argv);
  const sprintId = flags["--sprint-id"];
  const taskId = flags["--task-id"];
  const json = flags["--json"] === true;

  if (typeof sprintId !== "string" || typeof taskId !== "string") {
    console.error("usage: fulcrum sprints remove-task --sprint-id <id> --task-id <id>");
    process.exit(2);
  }

  const db = await openDb();
  try {
    await removeTaskFromSprint(db, { sprintId, taskId });
    if (json) {
      console.log(JSON.stringify({ ok: true, sprintId, taskId }));
    } else {
      console.log(`task ${taskId} removed from sprint ${sprintId}`);
    }
  } finally {
    await db.close();
  }
}
