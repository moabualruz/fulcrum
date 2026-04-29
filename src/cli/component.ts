import { ALL_COMPONENTS, getComponent } from "../components/catalog.ts";
import { planComponentOperation } from "../components/planner.ts";
import type { Operation } from "../components/types.ts";
import { ALL_AGENT_IDS, type AgentId } from "./mcp-registry.ts";

type ComponentOperation = Exclude<Operation, "status">;

const OPERATIONS: readonly ComponentOperation[] = ["install", "remove", "enable", "disable"];
const AGENT_IDS = new Set<string>(ALL_AGENT_IDS);

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "list":
      runList(rest);
      return;
    case "info":
      runInfo(rest);
      return;
    case "plan":
      runPlan(rest);
      return;
    case "install":
    case "remove":
    case "enable":
    case "disable":
      await runApply(cmd, rest);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`unknown component command: ${cmd}`);
  }
}

function runList(argv: string[]): void {
  const { args, json } = parseJsonOnly(argv, "component list");
  if (args.length > 0) {
    throw new Error(`unexpected argument for component list: ${args[0]}`);
  }
  const components = ALL_COMPONENTS.map((component) => ({
    id: component.id,
    kind: component.kind,
    description: component.description,
    defaultProfile: component.defaultProfile === true,
  }));

  if (json) {
    printJson(components);
    return;
  }

  console.log("Fulcrum components:");
  for (const component of components) {
    console.log(`  ${component.id}  ${component.description}`);
  }
}

function runInfo(argv: string[]): void {
  const { args, json } = parseJsonOnly(argv, "component info");
  const [id] = args;
  if (id === undefined) {
    throw new Error("usage: fulcrum component info <id> [--json]");
  }
  if (args.length > 1) {
    throw new Error(`unexpected argument for component info: ${args[1]}`);
  }
  const component = getComponent(id);
  if (component === null) {
    throw new Error(`unknown component: ${id}`);
  }

  if (json) {
    printJson(component);
    return;
  }

  console.log(`id: ${component.id}`);
  console.log(`kind: ${component.kind}`);
  console.log(`description: ${component.description}`);
  console.log("surfaces:");
  if (component.surfaces.length === 0) {
    console.log("  none");
    return;
  }
  for (const surface of component.surfaces) {
    console.log(`  ${surface.id}  ${surface.kind}  ${surface.target}`);
  }
}

function runPlan(argv: string[]): void {
  const [operationRaw, target, ...rest] = argv;
  if (!isComponentOperation(operationRaw) || target === undefined) {
    throw new Error(
      "usage: fulcrum component plan <install|remove|enable|disable> <component> [--agent <id>] [--all-agents] [--json]",
    );
  }

  const options = parsePlanOptions(rest);
  const plan = planComponentOperation({
    operation: operationRaw,
    target,
    agents: options.agents,
  });

  if (options.json) {
    printJson(plan);
    return;
  }

  console.log(`operation: ${plan.operation}`);
  console.log(`target: ${plan.target}`);
  console.log(`agents: ${plan.agents.join(", ")}`);
  console.log("actions:");
  if (plan.actions.length === 0) {
    console.log("  none");
  }
  for (const action of plan.actions) {
    const agent = action.agentId ?? "global";
    console.log(`  ${action.componentId}  ${agent}  ${action.change}  ${action.target}`);
  }
  for (const warning of plan.warnings) {
    console.log(`warning: ${warning}`);
  }
}

async function runApply(operation: ComponentOperation, argv: string[]): Promise<void> {
  const options = parseApplyOptions(argv, `component ${operation}`);
  const plan = planComponentOperation({
    operation,
    target: options.target,
    agents: options.agents,
  });

  if (options.json) {
    printJson(plan);
  }

  const { executeComponentPlan } = await import("../components/executor.ts");
  await executeComponentPlan(plan, { dryRun: options.dryRun });
}

function parseJsonOnly(argv: string[], command: string): { args: string[]; json: boolean } {
  const args: string[] = [];
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown option for ${command}: ${arg}`);
    }
    args.push(arg);
  }
  return { args, json };
}

function parsePlanOptions(argv: string[]): { agents?: AgentId[]; json: boolean } {
  const agents: AgentId[] = [];
  let json = false;
  let allAgents = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--json":
        json = true;
        break;
      case "--all-agents":
        allAgents = true;
        break;
      case "--agent": {
        const agentId = argv[index + 1];
        if (agentId === undefined || agentId.startsWith("-")) {
          throw new Error("missing value for --agent");
        }
        if (!AGENT_IDS.has(agentId)) {
          throw new Error(`unknown agent: ${agentId}`);
        }
        agents.push(agentId as AgentId);
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown option for component plan: ${arg}`);
    }
  }

  if (allAgents || agents.length === 0) {
    return { agents: undefined, json };
  }
  return { agents, json };
}

function parseApplyOptions(
  argv: string[],
  command: string,
): { target: string; agents?: AgentId[]; json: boolean; dryRun: boolean } {
  const agents: AgentId[] = [];
  let json = false;
  let dryRun = false;
  let allAgents = false;
  let target: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    switch (arg) {
      case "--json":
        json = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--all-agents":
        allAgents = true;
        break;
      case "--agent": {
        const agentId = argv[index + 1];
        if (agentId === undefined || agentId.startsWith("-")) {
          throw new Error("missing value for --agent");
        }
        if (!AGENT_IDS.has(agentId)) {
          throw new Error(`unknown agent: ${agentId}`);
        }
        agents.push(agentId as AgentId);
        index += 1;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`unknown option for ${command}: ${arg}`);
        }
        if (target !== undefined) {
          throw new Error(`unexpected argument for ${command}: ${arg}`);
        }
        target = arg;
    }
  }

  if (target === undefined) {
    throw new Error(`usage: fulcrum ${command} <component> [--agent <id>] [--all-agents] [--dry-run] [--json]`);
  }

  return {
    target,
    agents: allAgents || agents.length === 0 ? undefined : agents,
    json,
    dryRun,
  };
}

function isComponentOperation(value: string | undefined): value is ComponentOperation {
  return value !== undefined && OPERATIONS.includes(value as ComponentOperation);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(`fulcrum component

Usage:
  fulcrum component list [--json]
  fulcrum component info <id> [--json]
  fulcrum component plan <install|remove|enable|disable> <component> [--agent <id>] [--all-agents] [--json]
  fulcrum component <install|remove|enable|disable> <component> [--agent <id>] [--all-agents] [--dry-run] [--json]`);
}
