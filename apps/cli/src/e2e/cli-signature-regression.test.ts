import { describe, expect, test } from "bun:test";

import { run as runArtifact } from "../artifact.ts";
import { run as runConnectors } from "../connectors.ts";
import { run as runExport } from "../export.ts";
import { run as runImport } from "../import.ts";
import { run as runNotify } from "../notify.ts";
import { run as runProduct } from "../product.ts";
import { run as runSettings } from "../settings.ts";
import { run as runSprints } from "../sprints.ts";

type Runner = (argv: readonly string[], opts?: never) => Promise<void>;

const COMMANDS: Array<{
  name: string;
  run: Runner;
  help: string[];
  invalid: string[];
  caller: unknown;
}> = [
  {
    name: "import",
    run: runImport as Runner,
    help: ["csv", "--project", "--file", "--dry-run", "--json"],
    invalid: ["csv", "--bogus"],
    caller: { tasks: { bulkCreate: async () => ({ ok: true }) } },
  },
  {
    name: "export",
    run: runExport as Runner,
    help: ["tasks", "--project", "--format", "--output"],
    invalid: ["tasks", "--bogus"],
    caller: { tasks: { list: async () => [] } },
  },
  {
    name: "sprints",
    run: runSprints as Runner,
    help: ["add-task", "remove-task", "--sprint-id", "--task-id", "--json"],
    invalid: ["add-task", "--bogus"],
    caller: { sprints: { addTask: async () => ({}), removeTask: async () => ({}) } },
  },
  {
    name: "artifact",
    run: runArtifact as Runner,
    help: ["list", "show", "--json"],
    invalid: ["list", "--bogus"],
    caller: { artifacts: { list: async () => [], get: async () => ({ id: "a1" }) } },
  },
  {
    name: "connectors",
    run: runConnectors as Runner,
    help: ["list", "runs", "--json"],
    invalid: ["list", "--bogus"],
    caller: { connectors: { list: async () => [] } },
  },
  {
    name: "notify",
    run: runNotify as Runner,
    help: ["list", "mark-read", "rules", "channels", "--json"],
    invalid: ["list", "--bogus"],
    caller: { notify: { list: async () => [], markRead: async () => ({}), markAllRead: async () => ({}) } },
  },
  {
    name: "settings",
    run: runSettings as Runner,
    help: ["list", "get", "set", "--json"],
    invalid: ["list", "--bogus"],
    caller: { settings: { list: async () => [], get: async () => null, set: async () => ({}) } },
  },
  {
    name: "product",
    run: runProduct as Runner,
    help: ["projects", "tasks", "sprints", "search", "context", "--json"],
    invalid: ["projects", "list", "--bogus"],
    caller: { projects: { list: async () => [] } },
  },
];

describe("CLI command signature regression", () => {
  test.each(COMMANDS)("$name --help contains expected flags and subcommands", async ({ run, help }) => {
    const io = capture();
    await run(["--help"], io.opts as never);
    for (const expected of help) expect(io.out.join("\n")).toContain(expected);
    expect(io.exits).toEqual([]);
  });

  test.each(COMMANDS)("$name invalid flags exit 2", async ({ run, invalid, caller }) => {
    const io = capture();
    await run(invalid, { ...io.opts, caller } as never);
    expect(io.exits).toContain(2);
  });
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}
