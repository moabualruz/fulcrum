import { readFile } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import type { Container } from "@needle-di/core";

import { createLocalCaller } from "../local-caller.ts";

type JsonRecord = Record<string, unknown>;

type RoutingRuleRow = {
  id: string;
  name: string;
  projectId: string | null;
  conditionsJson: JsonRecord;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: string;
};

type RoutingDecision = {
  ruleId: string | null;
  source: string;
  agent: string;
  confidence: number | null;
};

// Enriched decision for draft views (D-26)
type RoutingEnrichedDecision = {
  status: string;
  matchedRuleId: string | null;
  draftId: string | null;
  factsUsed: JsonRecord;
  confidence: number | null;
  backend: string | null;
  model: string | null;
  whyUnmatched: string | null;
  evidence: string[];
};

type RoutingCaller = {
  routing: {
    list: (input?: JsonRecord) => Promise<RoutingRuleRow[]>;
    create: (input: JsonRecord) => Promise<RoutingRuleRow>;
    update: (input: JsonRecord) => Promise<RoutingRuleRow | null>;
    delete: (input: { id: string }) => Promise<{ ok: true }>;
    test: (input: { taskId: string }) => Promise<RoutingEnrichedDecision | null>;
    dryRun: (input: { taskJson: JsonRecord }) => Promise<RoutingEnrichedDecision | null>;
    drafts: {
      list: (input?: JsonRecord) => Promise<RoutingEnrichedDecision[]>;
      approve: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      delete: (input: { draftId: string }) => Promise<{ ok: boolean }>;
      update: (input: JsonRecord) => Promise<{ ok: boolean }>;
    };
    config: {
      updateLlmGate: (input: JsonRecord) => Promise<{ ok: boolean }>;
    };
  };
};

export interface RoutingRunOptions {
  caller?: RoutingCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum routing

Routing commands.

Usage:
  fulcrum routing rules list [--project <id>] [--json]
  fulcrum routing rules add --name <n> --agent <a> --conditions <json|@file.json> [--project <id>] [--skill <name>] [--priority <n>] [--json]
  fulcrum routing rules edit <id> [--name <n>] [--agent <a>] [--conditions <json|@file.json>] [--project <id>] [--skill <name>] [--priority <n>] [--enabled <true|false>] [--json]
  fulcrum routing rules delete <id> [--json]
  fulcrum routing assign <task-id> [--json]
  fulcrum routing simulate --task-json <json|@file.json> [--json]

  fulcrum routing drafts list [--status <review_needed|conflict|abstained>] [--json]
  fulcrum routing drafts approve <draft-id> [--json]
  fulcrum routing drafts update <draft-id> [--conditions <json>] [--action-agent <n>] [--json]
  fulcrum routing drafts delete <draft-id> [--json]

  fulcrum routing llm-gate get [--json]
  fulcrum routing llm-gate set --input-mode <task_facts|task_plus_history|full_context> [--enabled <true|false>] [--json]

Aliases:
  create=add, update=edit, test=assign, dry-run=simulate
`;

export async function run(
  argv: readonly string[],
  opts: RoutingRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const runOpts = { ...opts, print, printErr, exit };
  const [scope = "help", ...rest] = argv;

  if (scope === "help" || scope === "--help" || scope === "-h") {
    print(HELP);
    return;
  }

  if (scope === "rules") {
    const [verb = "help", ...args] = rest;
    switch (verb) {
      case "list":
        return withErrors("rules list", runOpts, async () => {
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.list(compact({
            projectId: flagValue(args, "--project"),
          }));
          printOutput(result, args, print, formatRules);
        });
      case "add":
      case "create":
        return withErrors(`rules ${verb}`, runOpts, async () => {
          const input = await parseRuleCreate(args);
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.create(input);
          printOutput(result, args, print, (value) => `Created routing rule ${(value as RoutingRuleRow).id}.`);
        });
      case "edit":
      case "update":
        return withErrors(`rules ${verb}`, runOpts, async () => {
          const id = requireArg(args, 0, `rules ${verb}`, "<id>");
          const input = await parseRuleUpdate(args.slice(1), id);
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.update(input);
          printOutput(result, args, print, (value) => {
            const row = value as RoutingRuleRow | null;
            return row ? `Updated routing rule ${row.id}.` : `Routing rule ${id} not found.`;
          });
        });
      case "delete":
        return withErrors("rules delete", runOpts, async () => {
          const id = requireArg(args, 0, "rules delete", "<id>");
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.delete({ id });
          printOutput(result, args, print, () => `Deleted routing rule ${id}.`);
        });
      case "test":
        return runAssign(args, "rules test", runOpts);
      case "dry-run":
        return runSimulate(args, "rules dry-run", runOpts);
      case "help":
      case "--help":
      case "-h":
        print(HELP);
        return;
      default:
        printErr(`fulcrum routing rules: unknown command '${verb}'`);
        printErr(HELP);
        exit(2);
    }
    return;
  }

  // ── Drafts scope (D-25) ─────────────────────────────────────────────

  if (scope === "drafts") {
    const [verb = "help", ...args] = rest;
    switch (verb) {
      case "list":
        return withErrors("drafts list", runOpts, async () => {
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.drafts.list(compact({
            status: flagValue(args, "--status"),
          }));
          printOutput(result, args, print, formatDrafts);
        });
      case "approve":
        return withErrors("drafts approve", runOpts, async () => {
          const draftId = requireArg(args, 0, "drafts approve", "<draft-id>");
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.drafts.approve({ draftId });
          printOutput(result, args, print, () => `Approved draft ${draftId}.`);
        });
      case "update":
        return withErrors("drafts update", runOpts, async () => {
          const draftId = requireArg(args, 0, "drafts update", "<draft-id>");
          const conditions = await optionalJsonFlag(args, "--conditions");
          const actionAgent = flagValue(args, "--action-agent");
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.drafts.update(compact({
            draftId,
            conditionsJson: conditions,
            actionAgent,
          }));
          printOutput(result, args, print, () => `Updated draft ${draftId}.`);
        });
      case "delete":
        return withErrors("drafts delete", runOpts, async () => {
          const draftId = requireArg(args, 0, "drafts delete", "<draft-id>");
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.drafts.delete({ draftId });
          printOutput(result, args, print, () => `Deleted draft ${draftId}.`);
        });
      case "help":
      case "--help":
      case "-h":
        print(HELP);
        return;
      default:
        printErr(`fulcrum routing drafts: unknown command '${verb}'`);
        printErr(HELP);
        exit(2);
    }
    return;
  }

  // ── LLM gate scope (D-15, D-16) ─────────────────────────────────────

  if (scope === "llm-gate") {
    const [verb = "help", ...args] = rest;
    switch (verb) {
      case "get":
        return withErrors("llm-gate get", runOpts, async () => {
          const features = (process.env["FULCRUM_FEATURES"] ?? "").split(",").map((f) => f.trim());
          const enabled = features.includes("router-llm");
          const inputMode = process.env["FULCRUM_LLM_INPUT_MODE"] ?? "full_context";
          const gateInfo = { enabled, inputMode, labels: [] as string[] };
          if (!enabled) gateInfo.labels.push("unavailable");
          printOutput(gateInfo, args, print, (value) => {
            const info = value as { enabled: boolean; inputMode: string };
            return `LLM gate: ${info.enabled ? "enabled" : "disabled"} (input mode: ${info.inputMode})`;
          });
        });
      case "set":
        return withErrors("llm-gate set", runOpts, async () => {
          const inputMode = flagValue(args, "--input-mode") as "task_facts" | "task_plus_history" | "full_context" | undefined;
          const enabledRaw = flagValue(args, "--enabled");
          const enabled = enabledRaw === "true" ? true : enabledRaw === "false" ? false : undefined;
          const caller = await resolveCaller(runOpts);
          const result = await caller.routing.config.updateLlmGate(compact({
            inputMode,
            enabled,
          }));
          printOutput(result, args, print, () => "LLM gate updated.");
        });
      case "help":
      case "--help":
      case "-h":
        print(HELP);
        return;
      default:
        printErr(`fulcrum routing llm-gate: unknown command '${verb}'`);
        printErr(HELP);
        exit(2);
    }
    return;
  }

  switch (scope) {
    case "assign":
    case "test":
      return runAssign(rest, scope, runOpts);
    case "simulate":
    case "dry-run":
      return runSimulate(rest, scope, runOpts);
    default:
      printErr(`fulcrum routing: unknown command '${scope}'`);
      printErr(HELP);
      exit(2);
  }
}

async function runAssign(
  argv: readonly string[],
  command: string,
  opts: Required<Pick<RoutingRunOptions, "print" | "printErr" | "exit">> & RoutingRunOptions,
): Promise<void> {
  return withErrors(command, opts, async () => {
    const taskId = requireArg(argv, 0, command, "<task-id>");
    const caller = await resolveCaller(opts);
    const result = await caller.routing.test({ taskId });
    printOutput(result, argv, opts.print, formatEnrichedDecision);
  });
}

async function runSimulate(
  argv: readonly string[],
  command: string,
  opts: Required<Pick<RoutingRunOptions, "print" | "printErr" | "exit">> & RoutingRunOptions,
): Promise<void> {
  return withErrors(command, opts, async () => {
    const raw = requiredFlag(argv, "--task-json", command);
    const taskJson = await parseJsonReference(raw, "--task-json");
    const caller = await resolveCaller(opts);
    const result = await caller.routing.dryRun({ taskJson });
    printOutput(result, argv, opts.print, formatEnrichedDecision);
  });
}

async function parseRuleCreate(argv: readonly string[]): Promise<JsonRecord> {
  return compact({
    name: requiredFlag(argv, "--name", "rules add"),
    actionAgent: requiredFlag(argv, "--agent", "rules add"),
    conditionsJson: await parseJsonReference(requiredFlag(argv, "--conditions", "rules add"), "--conditions"),
    projectId: flagValue(argv, "--project"),
    actionSkillSet: flagValues(argv, "--skill"),
    priority: numberFlag(argv, "--priority"),
  });
}

async function parseRuleUpdate(argv: readonly string[], id: string): Promise<JsonRecord> {
  return compact({
    id,
    name: flagValue(argv, "--name"),
    actionAgent: flagValue(argv, "--agent"),
    conditionsJson: await optionalJsonFlag(argv, "--conditions"),
    projectId: flagValue(argv, "--project"),
    actionSkillSet: flagValues(argv, "--skill"),
    priority: numberFlag(argv, "--priority"),
    enabled: booleanFlag(argv, "--enabled"),
  });
}

async function optionalJsonFlag(argv: readonly string[], flag: string): Promise<JsonRecord | undefined> {
  const value = flagValue(argv, flag);
  return value === undefined ? undefined : parseJsonReference(value, flag);
}

async function parseJsonReference(value: string, flag: string): Promise<JsonRecord> {
  const source = value.startsWith("@") ? await readFile(value.slice(1), "utf8") : value;
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected object");
    }
    return parsed as JsonRecord;
  } catch (err) {
    throw new Error(`invalid ${flag} JSON: ${(err as Error).message}`);
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function requiredFlag(argv: readonly string[], flag: string, command: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined) throw new Error(`fulcrum routing ${command}: missing required flag ${flag}`);
  return value;
}

function flagValues(argv: readonly string[], flag: string): string[] | undefined {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1] && !argv[i + 1]!.startsWith("--")) values.push(argv[i + 1]!);
  }
  return values.length > 0 ? values : undefined;
}

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

function booleanFlag(argv: readonly string[], flag: string): boolean | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} must be true or false`);
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function requireArg(argv: readonly string[], index: number, command: string, name: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`fulcrum routing ${command}: missing required argument ${name}`);
  }
  return value;
}

function printOutput(
  value: unknown,
  argv: readonly string[],
  print: (line: string) => void,
  human: (value: unknown) => string,
): void {
  print(argv.includes("--json") ? JSON.stringify(value) : human(value));
}

function formatRules(value: unknown): string {
  const rows = Array.isArray(value) ? value as RoutingRuleRow[] : [];
  if (rows.length === 0) return "No routing rules found.";
  return [
    "ID  PRIORITY  ENABLED  AGENT  SOURCE  NAME",
    ...rows.map((row) =>
      `${row.id}  ${row.priority}  ${row.enabled ? "true" : "false"}  ${row.actionAgent}  ${row.source}  ${row.name}`
    ),
  ].join("\n");
}

function formatDecision(value: unknown): string {
  const decision = value as RoutingDecision | null;
  if (!decision) return "No routing decision.";
  return [
    `agent: ${decision.agent}`,
    `source: ${decision.source}`,
    `ruleId: ${decision.ruleId ?? ""}`,
    `confidence: ${decision.confidence ?? ""}`,
  ].join("\n");
}

function formatEnrichedDecision(value: unknown): string {
  const decision = value as RoutingEnrichedDecision | null;
  if (!decision) return "No routing decision.";
  const labels: string[] = [];
  if (decision.status === "no_match" || decision.status === "abstained") labels.push("abstained");
  if (decision.backend === null && decision.status === "no_match") labels.push("unavailable");
  return [
    `status: ${decision.status}`,
    `confidence: ${decision.confidence ?? ""}`,
    ...(decision.matchedRuleId ? [`ruleId: ${decision.matchedRuleId}`] : []),
    ...(decision.draftId ? [`draftId: ${decision.draftId}`] : []),
    ...(decision.backend ? [`backend: ${decision.backend}`] : []),
    ...(decision.model ? [`model: ${decision.model}`] : []),
    ...(decision.whyUnmatched ? [`why: ${decision.whyUnmatched}`] : []),
    ...(labels.length > 0 ? [`labels: ${labels.join(",")}`] : []),
  ].join("\n");
}

function formatDrafts(value: unknown): string {
  const drafts = Array.isArray(value) ? value as RoutingEnrichedDecision[] : [];
  if (drafts.length === 0) return "No drafts found.";
  return [
    "DRAFT ID  STATUS  CONFIDENCE  MATCHED RULE",
    ...drafts.map((d) =>
      `${d.draftId ?? ""}  ${d.status}  ${d.confidence ?? ""}  ${d.matchedRuleId ?? ""}`
    ),
  ].join("\n");
}

async function withErrors(
  command: string,
  opts: Required<Pick<RoutingRunOptions, "print" | "printErr" | "exit">> & RoutingRunOptions,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : (err as Error).message;
    opts.printErr(`fulcrum routing ${command}: ${msg}`);
    opts.exit(1);
  }
}

async function resolveCaller(opts: RoutingRunOptions): Promise<RoutingCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as unknown as RoutingCaller;
}
