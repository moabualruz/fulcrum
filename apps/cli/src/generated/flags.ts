import { Command, Option } from "commander";

export function createFlagsCommand(): Command {
  const command = new Command("flags");
  command.description("Generated flags commands.");

  const evaluateCommand = command.command("evaluate");
  evaluateCommand.description("flags evaluate");
  evaluateCommand.option("--json", "Emit JSON output");
  evaluateCommand.addOption(new Option("--flag <choice>", "flag").choices([]));
  evaluateCommand.option("--org-id <string>", "org-id");
  evaluateCommand.option("--user-id <string>", "user-id");
  evaluateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.evaluate requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const experimentsAssignmentsCommand = command.command("experiments assignments");
  experimentsAssignmentsCommand.description("flags experiments assignments");
  experimentsAssignmentsCommand.option("--json", "Emit JSON output");
  experimentsAssignmentsCommand.option("--experiment-id <string>", "experiment-id");
  experimentsAssignmentsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.experiments.assignments requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const experimentsCreateCommand = command.command("experiments create");
  experimentsCreateCommand.description("flags experiments create");
  experimentsCreateCommand.option("--json", "Emit JSON output");
  experimentsCreateCommand.option("--description <string>", "description");
  experimentsCreateCommand.option("--name <string>", "name");
  experimentsCreateCommand.option("--rollout-percent <number>", "rollout-percent", Number.parseFloat);
  experimentsCreateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.experiments.create requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const experimentsListCommand = command.command("experiments list");
  experimentsListCommand.description("flags experiments list");
  experimentsListCommand.option("--json", "Emit JSON output");
  experimentsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.experiments.list requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const experimentsMetricsCommand = command.command("experiments metrics");
  experimentsMetricsCommand.description("flags experiments metrics");
  experimentsMetricsCommand.option("--json", "Emit JSON output");
  experimentsMetricsCommand.option("--conversion-kind <string>", "conversion-kind");
  experimentsMetricsCommand.option("--experiment-id <string>", "experiment-id");
  experimentsMetricsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.experiments.metrics requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const listCommand = command.command("list");
  listCommand.description("flags list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.list requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const setCommand = command.command("set");
  setCommand.description("flags set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--enabled", "enabled");
  setCommand.addOption(new Option("--flag <choice>", "flag").choices([]));
  setCommand.option("--org-id <string>", "org-id");
  setCommand.option("--user-id <string>", "user-id");
  setCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.set requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const setOverrideCommand = command.command("set-override");
  setOverrideCommand.description("flags setOverride");
  setOverrideCommand.option("--json", "Emit JSON output");
  setOverrideCommand.option("--enabled", "enabled");
  setOverrideCommand.addOption(new Option("--flag <choice>", "flag").choices([]));
  setOverrideCommand.option("--org-id <string>", "org-id");
  setOverrideCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.setOverride requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const setRolloutCommand = command.command("set-rollout");
  setRolloutCommand.description("flags setRollout");
  setRolloutCommand.option("--json", "Emit JSON output");
  setRolloutCommand.addOption(new Option("--flag <choice>", "flag").choices([]));
  setRolloutCommand.option("--org-id <string>", "org-id");
  setRolloutCommand.option("--rollout-percent <number>", "rollout-percent", Number.parseFloat);
  setRolloutCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for flags.setRollout requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}
