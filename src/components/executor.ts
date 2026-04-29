import { getComponent } from "./catalog.ts";
import { applyHookAction } from "./adapters/hooks.ts";
import { ComponentLedger } from "./ledger.ts";
import type { ComponentAction, ComponentPlan } from "./types.ts";

interface ExecuteOptions {
  dryRun?: boolean;
  purge?: boolean;
  keepState?: boolean;
  includeCaveman?: boolean;
}

export async function executeComponentPlan(
  plan: ComponentPlan,
  opts: ExecuteOptions = {},
): Promise<void> {
  const appliedVendorActions = new Set<string>();

  if (opts.dryRun === true) {
    for (const action of plan.actions) {
      if (shouldSkipAction(action, opts)) continue;
      console.log(`DRY RUN ${action.id} ${action.change} ${action.kind} ${action.target}`);
      if (isVendorSurface(action.kind) && shouldApplyAction(action, appliedVendorActions)) {
        await applyAction(action, true);
      }
    }
    return;
  }

  const ledger = ComponentLedger.open();
  const operationId = ledger.beginOperation(plan.operation, plan.target);
  let failed = false;

  try {
    for (const action of plan.actions) {
      try {
        if (shouldSkipAction(action, opts)) continue;
        if (shouldApplyAction(action, appliedVendorActions)) {
          await applyAction(action, false, opts);
        }
        recordSuccessfulAction(ledger, operationId, action);
      } catch (error) {
        failed = true;
        recordFailedOperationStep(ledger, operationId, action, error);
        throw error;
      }
    }
  } finally {
    ledger.endOperation(operationId, failed ? "error" : "ok");
    ledger.close();
  }
}

function shouldSkipAction(action: ComponentAction, opts: ExecuteOptions): boolean {
  if (opts.includeCaveman === false && action.componentId === "package.caveman") {
    return true;
  }
  if (opts.keepState === true && action.componentId === "mcp.registry") {
    return true;
  }
  return false;
}

function shouldApplyAction(action: ComponentAction, appliedVendorActions: Set<string>): boolean {
  if (!isVendorSurface(action.kind)) return true;
  const key = vendorActionKey(action);
  if (appliedVendorActions.has(key)) return false;
  appliedVendorActions.add(key);
  return true;
}

function vendorActionKey(action: ComponentAction): string {
  return `${action.componentId}:${action.surfaceId}:${action.operation}:${action.change}`;
}

async function applyAction(
  action: ComponentAction,
  dryRun: boolean,
  opts: ExecuteOptions = {},
): Promise<void> {
  if (action.change === "noop" || action.change === "preserve") return;

  switch (action.kind) {
    case "hook-registration":
      await applyHookAction(action);
      return;
    case "mcp-registry-entry":
    case "mcp-agent-config": {
      const { applyMcpAction } = await import("./adapters/mcp.ts");
      await applyMcpAction(action);
      return;
    }
    case "sentinel-block": {
      const { applyRulesAction } = await import("./adapters/sentinel.ts");
      await applyRulesAction(action.operation, false);
      return;
    }
    case "policy-seed": {
      const { applyPolicyAction } = await import("./adapters/files.ts");
      await applyPolicyAction(action.operation, false, opts.purge === true);
      return;
    }
    case "skill-sync":
    case "upstream-skill-sync":
    case "vendor-command":
    case "directory-copy":
    case "file-copy": {
      const { applyVendorAction } = await import("./adapters/vendor.ts");
      await applyVendorAction(action, dryRun);
      return;
    }
    default:
      throw new Error(`unsupported component surface kind: ${action.kind}`);
  }
}

function isVendorSurface(kind: ComponentAction["kind"]): boolean {
  return (
    kind === "skill-sync" ||
    kind === "upstream-skill-sync" ||
    kind === "vendor-command" ||
    kind === "directory-copy" ||
    kind === "file-copy"
  );
}

function recordSuccessfulAction(
  ledger: ComponentLedger,
  operationId: string,
  action: ComponentAction,
): void {
  const component = getComponent(action.componentId);
  const surface = component?.surfaces.find((candidate) => candidate.id === action.surfaceId);
  ledger.recordComponent({
    id: action.componentId,
    kind: component?.kind ?? "unknown",
    status: statusForOperation(action.operation),
  });
  if (surface !== undefined) {
    ledger.recordSurface({
      id: surfaceLedgerId(action),
      componentId: action.componentId,
      ...(action.agentId === undefined ? {} : { agentId: action.agentId }),
      kind: action.kind,
      target: action.target,
      ownerKey: surface.ownerKey,
      desiredEnabled: desiredEnabled(action),
      removePolicy: surface.removePolicy,
    });
  }
  ledger.recordOperationStep({
    operationId,
    actionId: action.id,
    componentId: action.componentId,
    ...(action.agentId === undefined ? {} : { agentId: action.agentId }),
    action: action.change,
    status: "ok",
  });
}

function recordFailedOperationStep(
  ledger: ComponentLedger,
  operationId: string,
  action: ComponentAction,
  error: unknown,
): void {
  ledger.recordOperationStep({
    operationId,
    actionId: action.id,
    componentId: action.componentId,
    ...(action.agentId === undefined ? {} : { agentId: action.agentId }),
    action: action.change,
    status: "error",
    error: errorMessage(error),
  });
}

function surfaceLedgerId(action: ComponentAction): string {
  if (action.agentId === undefined) return action.surfaceId;
  return `${action.surfaceId}:${action.agentId}`;
}

function desiredEnabled(action: ComponentAction): boolean | undefined {
  switch (action.change) {
    case "create-or-update":
    case "enable":
      return true;
    case "disable":
      return false;
    default:
      return undefined;
  }
}

function statusForOperation(operation: ComponentAction["operation"]): string {
  switch (operation) {
    case "remove":
      return "removed";
    case "disable":
      return "disabled";
    default:
      return "installed";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
