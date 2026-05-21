/**
 * fulcrum project config: project configuration commands.
 *
 * Usage:
 *   fulcrum project config <projectId>
 *   fulcrum project config <projectId> --methodology scrum|kanban|none
 *   fulcrum project config <projectId> --types epic,task,subtask,bug
 *   fulcrum project config <projectId> --json
 */

import {
  createWorkflowApiCallerFromEnv,
  type WorkflowApiEnvironment,
} from "@workflow-coordination/interface/http/workflow-api-client.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface ProjectConfigRunOptions {
  caller?: {
    workflows: {
      getMethodology: AnyFn;
      updateMethodology: AnyFn;
      updateEnabledTaskTypes: AnyFn;
    };
  };
  env?: WorkflowApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const VALID_METHODOLOGIES = ["scrum", "kanban", "none"] as const;
type Methodology = (typeof VALID_METHODOLOGIES)[number];

const HELP = `fulcrum project config

Manage project configuration.

Usage:
  fulcrum project config <projectId>
  fulcrum project config <projectId> --methodology scrum|kanban|none
  fulcrum project config <projectId> --types epic,task,subtask,bug
  fulcrum project config <projectId> --json

Options:
  --methodology     Set project methodology
  --types           Set enabled task types (comma-separated)
  --json            Output as machine-readable JSON
`;

export async function run(argv: readonly string[], opts: ProjectConfigRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [projectId, ...rest] = argv;

  if (!projectId || projectId === "--help" || projectId === "-h") {
    print(HELP);
    return;
  }

  const jsonMode = rest.includes("--json");
  const methodologyIdx = rest.indexOf("--methodology");
  const methodology = methodologyIdx >= 0 ? rest[methodologyIdx + 1] : undefined;
  const typesIdx = rest.indexOf("--types");
  const typesArg = typesIdx >= 0 ? rest[typesIdx + 1] : undefined;

  try {
    const caller = await resolveCaller(opts);

    // Set methodology if provided
    if (methodology) {
      if (!VALID_METHODOLOGIES.includes(methodology as Methodology)) {
        printErr(`fulcrum project config: invalid methodology '${methodology}'`);
        printErr("Valid: " + VALID_METHODOLOGIES.join(", "));
        exit(2);
        return;
      }
      await caller.workflows.updateMethodology({ projectId, methodology });
      print(`Methodology set to '${methodology}'`);
    }

    // Set types if provided
    if (typesArg) {
      const types = typesArg.split(",").map((t) => t.trim()).filter(Boolean);
      await caller.workflows.updateEnabledTaskTypes({ projectId, types });
      print(`Enabled types: ${types.join(", ")}`);
    }

    // Always display current config
    const config = await caller.workflows.getMethodology({ projectId });

    if (jsonMode) {
      print(JSON.stringify(config, null, 2));
    } else {
      print(`\nProject: ${projectId}`);
      print("─".repeat(40));
      print(`Methodology:   ${config.methodology ?? "(none)"}`);
      print(`Enabled types: ${(config.enabledTaskTypes ?? []).join(", ") || "(none)"}`);
      print(`Workflow:      ${config.transitionCount ?? 0} transitions configured`);
    }
  } catch (err) {
    printErr(`fulcrum project config: ${(err as Error).message}`);
    exit(1);
  }
}

async function resolveCaller(opts: ProjectConfigRunOptions): Promise<Required<ProjectConfigRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;
  const apiCaller = createWorkflowApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Workflow API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller as never;
}
