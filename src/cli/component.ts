import { stat } from "node:fs/promises";
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
    case "status":
      await runStatus(rest);
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

async function runStatus(argv: string[]): Promise<void> {
  const options = parseStatusOptions(argv);
  const { ComponentLedger } = await import("../components/ledger.ts");
  const ledger = ComponentLedger.open();
  try {
    if (options.target !== undefined) {
      const component = getComponent(options.target);
      if (component === null) {
        throw new Error(`unknown component: ${options.target}`);
      }
      const status = ledger.componentStatus(component.id);
      const surfaceRows = ledger.surfacesForComponent(component.id)
        .filter((surface) => options.agent === undefined || surface.agent_id === options.agent)
      const surfaces = await Promise.all(surfaceRows.map(async (surface) => {
        const nativeExists = await nativeTargetExists(surface.target);
        return {
          id: surface.id,
          componentId: surface.component_id,
          agentId: surface.agent_id,
          kind: surface.kind,
          target: surface.target,
          state: nativeExists ? "present" : "missing-native-root",
          managed: true,
          modified: false,
          owned: true,
          nativeExists,
          ledgerExists: true,
          status: nativeExists ? "installed" : "missing-native-root",
          reason: nativeExists ? "ok" : "missing-native-root",
        };
      }));
      const ledgerExists = status !== null;
      const nativeExists = surfaces.length === 0 ? ledgerExists : surfaces.every((surface) => surface.nativeExists);
      const effectiveStatus = !ledgerExists
        ? "not-installed"
        : nativeExists
          ? status.status
          : "missing-native-root";
      const payload = {
        componentId: component.id,
        status: effectiveStatus,
        owned: ledgerExists,
        nativeExists,
        ledgerExists,
        reason: !ledgerExists ? "not-installed" : nativeExists ? "ok" : "missing-native-root",
        surfaces,
        ...(component.kind === "package" ? { parity: await packageParity(component.id) } : {}),
      };
      if (options.json) {
        printJson(payload);
      } else {
        console.log(`${payload.componentId}: ${payload.status}`);
      }
      return;
    }

    const payload = ALL_COMPONENTS.map((component) => {
      const status = ledger.componentStatus(component.id);
      return {
        componentId: component.id,
        status: status?.status ?? "not-installed",
      };
    });
    if (options.json) {
      printJson(payload);
      return;
    }
    for (const row of payload) {
      console.log(`${row.componentId.padEnd(28)} ${row.status}`);
    }
  } finally {
    ledger.close();
  }
}

async function nativeTargetExists(target: string): Promise<boolean> {
  if (!target.startsWith("~/") && !target.startsWith("/")) return true;
  return (await existingPath(expandHome(target, process.env["HOME"] ?? ""))) !== undefined;
}

async function packageParity(componentId: string): Promise<unknown> {
  const { getPackageSurfaceManifest, isKnownPackageId, packageCacheSourceRoot } = await import("./package-surfaces.ts");
  const { planPackageMirrorTargets } = await import("./package-mirror.ts");
  const { auditPackageParity } = await import("./package-parity.ts");
  const home = process.env["HOME"] ?? "";
  const sourceRoot = isKnownPackageId(componentId) ? await existingPath(packageCacheSourceRoot(componentId, home)) : undefined;
  const manifest = await getPackageSurfaceManifest(componentId, sourceRoot === undefined ? {} : { sourceRoot });
  const targets = planPackageMirrorTargets(manifest, [...ALL_AGENT_IDS]);
  const byAgent = await Promise.all(
    ALL_AGENT_IDS.map(async (agentId) => {
      const agentTargets = targets.filter((target) => target.agentId === agentId);
      return auditPackageParity(manifest, agentTargets, { home });
    }),
  );
  return byAgent;
}

async function existingPath(path: string): Promise<string | undefined> {
  try {
    await stat(path);
    return path;
  } catch {
    return undefined;
  }
}

function expandHome(path: string, home: string): string {
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
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
  await executeComponentPlan(plan, { dryRun: options.dryRun, purge: options.purge });
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

function parseStatusOptions(argv: string[]): { target?: string; agent?: AgentId; json: boolean } {
  let target: string | undefined;
  let agent: AgentId | undefined;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    switch (arg) {
      case "--json":
        json = true;
        break;
      case "--agent": {
        const agentId = argv[index + 1];
        if (agentId === undefined || agentId.startsWith("-")) {
          throw new Error("missing value for --agent");
        }
        if (!AGENT_IDS.has(agentId)) {
          throw new Error(`unknown agent: ${agentId}`);
        }
        agent = agentId as AgentId;
        index += 1;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`unknown option for component status: ${arg}`);
        }
        if (target !== undefined) {
          throw new Error(`unexpected argument for component status: ${arg}`);
        }
        target = arg;
    }
  }

  return { target, agent, json };
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
): { target: string; agents?: AgentId[]; json: boolean; dryRun: boolean; purge: boolean } {
  const agents: AgentId[] = [];
  let json = false;
  let dryRun = false;
  let purge = false;
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
      case "--purge":
        if (command !== "component remove") {
          throw new Error(`unknown option for ${command}: --purge`);
        }
        purge = true;
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
    purge,
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
  fulcrum component status [component] [--agent <id>] [--json]
  fulcrum component <install|enable|disable> <component> [--agent <id>] [--all-agents] [--dry-run] [--json]
  fulcrum component remove <component> [--agent <id>] [--all-agents] [--purge] [--dry-run] [--json]`);
}
