/**
 * fulcrum task relate — task relationship commands.
 *
 * Usage:
 *   fulcrum task relate <taskId> <type> <otherTaskId>
 *     type: blocks | relates-to | duplicate-of
 *   fulcrum task relate <taskId> --list
 *   fulcrum task relate <taskId> --delete <relationshipId>
 */

import type { Container } from "@needle-di/core";
import { createLocalCaller } from "../local-caller.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface TaskRelateRunOptions {
  caller?: {
    relationships: {
      create: AnyFn;
      listForTask: AnyFn;
      delete: AnyFn;
    };
  };
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const VALID_TYPES = ["blocks", "blocked-by", "relates-to", "duplicate-of"] as const;
type RelType = (typeof VALID_TYPES)[number];

const HELP = `fulcrum task relate

Manage task relationships.

Usage:
  fulcrum task relate <taskId> <type> <otherTaskId>
  fulcrum task relate <taskId> --list
  fulcrum task relate <taskId> --delete <relationshipId>

Relationship types:
  blocks, blocked-by, relates-to, duplicate-of
`;

export async function run(argv: readonly string[], opts: TaskRelateRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;

  if (argv.includes("--help") || argv.includes("-h")) {
    print(HELP);
    return;
  }

  const [taskId, second, third] = argv;

  if (!taskId) {
    printErr("fulcrum task relate: missing required argument <taskId>");
    exit(2);
    return;
  }

  // --list mode
  if (second === "--list" || argv.includes("--list")) {
    try {
      const caller = await resolveCaller(opts);
      const results = await caller.relationships.listForTask({ taskId });
      if (!Array.isArray(results) || results.length === 0) {
        print("  (no relationships)");
        return;
      }
      print(`\nRelationships for ${taskId}`);
      print("─".repeat(60));
      print("  type          direction  related task");
      print("  ─────────────────────────────────────");
      for (const rel of results) {
        print(`  ${String(rel.type ?? "").padEnd(14)}${String(rel.direction ?? "").padEnd(11)}${rel.relatedTaskTitle ?? rel.relatedTaskId ?? ""}`);
      }
    } catch (err) {
      printErr(`fulcrum task relate --list: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  // --delete mode
  const deleteIdx = argv.indexOf("--delete");
  if (deleteIdx >= 0) {
    const relationshipId = argv[deleteIdx + 1];
    if (!relationshipId) {
      printErr("fulcrum task relate --delete: missing <relationshipId>");
      exit(2);
      return;
    }
    try {
      const caller = await resolveCaller(opts);
      await caller.relationships.delete({ relationshipId });
      print(`Deleted relationship ${relationshipId}`);
    } catch (err) {
      printErr(`fulcrum task relate --delete: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  // create mode: <taskId> <type> <otherTaskId>
  if (!second || !third) {
    printErr("fulcrum task relate: usage: fulcrum task relate <taskId> <type> <otherTaskId>");
    printErr("Types: " + VALID_TYPES.join(", "));
    exit(2);
    return;
  }

  if (!VALID_TYPES.includes(second as RelType)) {
    printErr(`fulcrum task relate: invalid type '${second}'`);
    printErr("Valid types: " + VALID_TYPES.join(", "));
    exit(2);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    const result = await caller.relationships.create({
      sourceTaskId: taskId,
      targetTaskId: third,
      type: second,
    });
    print(`Created relationship ${result.id ?? "(unknown)"}: ${taskId} ${second} ${third}`);
  } catch (err) {
    printErr(`fulcrum task relate: ${(err as Error).message}`);
    exit(1);
  }
}

async function resolveCaller(opts: TaskRelateRunOptions): Promise<Required<TaskRelateRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;

  return await createLocalCaller({ container: opts.container, requireSession: false }) as never;
}
