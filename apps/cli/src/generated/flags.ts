import { Command, Option } from "commander";
import { FEATURE_FLAGS } from "@platform-core/application/feature-flags/registry.ts";
import { createFeatureExperimentApiCallerFromEnv } from "@platform-core/interface/http/feature-experiment-api-client.ts";

export function createFlagsCommand(): Command {
  const command = new Command("flags");
  command.description("Generated flags commands.");

  const evaluateCommand = command.command("evaluate");
  evaluateCommand.description("flags evaluate");
  evaluateCommand.option("--json", "Emit JSON output");
  evaluateCommand.addOption(new Option("--flag <choice>", "flag").choices([...FEATURE_FLAGS]));
  evaluateCommand.option("--org-id <string>", "org-id");
  evaluateCommand.option("--user-id <string>", "user-id");
  evaluateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().evaluate({
        flag: requiredOption(options, "flag"),
        orgId: options.orgId,
        userId: options.userId,
      })
    );
  });

  const experimentsCommand = command.command("experiments");
  experimentsCommand.description("Generated feature experiment commands.");

  const experimentsAssignmentsCommand = experimentsCommand.command("assignments");
  experimentsAssignmentsCommand.description("flags experiments assignments");
  experimentsAssignmentsCommand.option("--json", "Emit JSON output");
  experimentsAssignmentsCommand.option("--experiment-id <string>", "experiment-id");
  experimentsAssignmentsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().experiments.assignments({
        experimentId: requiredOption(options, "experimentId"),
      })
    );
  });

  const experimentsCreateCommand = experimentsCommand.command("create");
  experimentsCreateCommand.description("flags experiments create");
  experimentsCreateCommand.option("--json", "Emit JSON output");
  experimentsCreateCommand.option("--description <string>", "description");
  experimentsCreateCommand.option("--name <string>", "name");
  experimentsCreateCommand.option("--rollout-percent <number>", "rollout-percent", Number.parseFloat);
  experimentsCreateCommand.option("--variants <csv>", "Comma-separated variants");
  experimentsCreateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().experiments.create(compact({
        description: options.description,
        name: requiredOption(options, "name"),
        rolloutPercent: options.rolloutPercent,
        variants: csvOption(options, "variants"),
      }))
    );
  });

  const experimentsListCommand = experimentsCommand.command("list");
  experimentsListCommand.description("flags experiments list");
  experimentsListCommand.option("--json", "Emit JSON output");
  experimentsListCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await flagsClient().experiments.list());
  });

  const experimentsMetricsCommand = experimentsCommand.command("metrics");
  experimentsMetricsCommand.description("flags experiments metrics");
  experimentsMetricsCommand.option("--json", "Emit JSON output");
  experimentsMetricsCommand.option("--conversion-kind <string>", "conversion-kind");
  experimentsMetricsCommand.option("--experiment-id <string>", "experiment-id");
  experimentsMetricsCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().experiments.metrics({
        conversionKind: requiredOption(options, "conversionKind"),
        experimentId: requiredOption(options, "experimentId"),
      })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("flags list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await flagsClient().list());
  });

  const setCommand = command.command("set");
  setCommand.description("flags set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--enabled", "enabled");
  setCommand.option("--disabled", "disabled");
  setCommand.addOption(new Option("--flag <choice>", "flag").choices([...FEATURE_FLAGS]));
  setCommand.option("--org-id <string>", "org-id");
  setCommand.option("--user-id <string>", "user-id");
  setCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().set({
        enabled: enabledOption(options),
        flag: requiredOption(options, "flag"),
        orgId: options.orgId,
        userId: options.userId,
      })
    );
  });

  const setOverrideCommand = command.command("set-override");
  setOverrideCommand.description("flags setOverride");
  setOverrideCommand.option("--json", "Emit JSON output");
  setOverrideCommand.option("--enabled", "enabled");
  setOverrideCommand.option("--disabled", "disabled");
  setOverrideCommand.addOption(new Option("--flag <choice>", "flag").choices([...FEATURE_FLAGS]));
  setOverrideCommand.option("--org-id <string>", "org-id");
  setOverrideCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().setOverride({
        enabled: enabledOption(options),
        flag: requiredOption(options, "flag"),
        orgId: options.orgId,
      })
    );
  });

  const setRolloutCommand = command.command("set-rollout");
  setRolloutCommand.description("flags setRollout");
  setRolloutCommand.option("--json", "Emit JSON output");
  setRolloutCommand.addOption(new Option("--flag <choice>", "flag").choices([...FEATURE_FLAGS]));
  setRolloutCommand.option("--org-id <string>", "org-id");
  setRolloutCommand.option("--rollout-percent <number>", "rollout-percent", Number.parseFloat);
  setRolloutCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await flagsClient().setRollout({
        flag: requiredOption(options, "flag"),
        orgId: options.orgId,
        rolloutPercent: requiredNumberOption(options, "rolloutPercent"),
      })
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function flagsClient() {
  const caller = createFeatureExperimentApiCallerFromEnv();
  if (!caller) {
    throw new Error("Feature experiment API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.flags;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function csvOption(options: Record<string, unknown>, key: string): string[] {
  const values = requiredOption(options, key).split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`${key} must include at least one value.`);
  return values;
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function requiredNumberOption(options: Record<string, unknown>, key: string): number {
  const value = options[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${key} is required.`);
}

function enabledOption(options: Record<string, unknown>): boolean {
  if (options.enabled === true && options.disabled === true) {
    throw new Error("Use either --enabled or --disabled, not both.");
  }
  if (options.enabled === true) return true;
  if (options.disabled === true) return false;
  throw new Error("enabled is required.");
}
