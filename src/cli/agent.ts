import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import { dispatchRunAction } from "../services/runs.ts";

const HELP = `fulcrum agent — agent run commands

Usage:
  fulcrum agent run --task <id> [--agent <id>] [--json]
`;

const BOOLEAN_FLAGS = new Set<string>(["--json"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

async function openProductDb(): Promise<ProductDb> {
  const dir = productDbDir();
  await mkdir(dir, { recursive: true });
  const db = await openPglite(join(dir, "main"));
  await runMigrations(db);
  return db;
}

export async function run(argv: readonly string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  if (verb !== "run") {
    console.error(`fulcrum agent: unknown verb '${verb}'`);
    process.exit(2);
  }
  const parsed = parseArgs(rest);
  const taskId = flag(parsed, "task");
  if (!taskId) {
    console.error("usage: fulcrum agent run --task <id>");
    process.exit(2);
  }
  const agent = flag(parsed, "agent") ?? "codex";
  const json = parsed.flags["--json"] !== undefined;
  const db = await openProductDb();
  try {
    const taskRows = await db.query<{ org_id: string; project_id: string | null }>(
      `SELECT org_id, project_id FROM tasks WHERE id = $1`,
      [taskId],
    );
    const task = taskRows[0];
    if (!task) {
      console.error(`task not found: ${taskId}`);
      process.exit(1);
    }
    const result = await dispatchRunAction(db, {
      orgId: task.org_id,
      projectId: task.project_id,
      taskId,
      agent,
    });
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.status}\t${result.agent}\t${result.id}`);
  } finally {
    await db.close();
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
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
    if (next && !next.startsWith("--")) {
      flags[token] = next;
      i += 1;
    } else {
      flags[token] = true;
    }
  }
  return { positionals, flags };
}

function flag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[`--${name}`];
  return typeof value === "string" ? value : undefined;
}
