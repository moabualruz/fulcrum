import { Command, Option } from "commander";

export function createReportsCommand(): Command {
  const command = new Command("reports");
  command.description("Generated reports commands.");

  const blockedItemsCommand = command.command("blocked-items");
  blockedItemsCommand.description("reports blockedItems");
  blockedItemsCommand.option("--json", "Emit JSON output");
  blockedItemsCommand.option("--org-id <string>", "org-id");
  blockedItemsCommand.option("--scope-id <string>", "scope-id");
  blockedItemsCommand.addOption(new Option("--scope-type <choice>", "scope-type").choices(["sprint","project","epic","workspace"]));
  blockedItemsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.blockedItems requires an explicit surface adapter.");
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

  const burndownCommand = command.command("burndown");
  burndownCommand.description("reports burndown");
  burndownCommand.option("--json", "Emit JSON output");
  burndownCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.burndown requires an explicit surface adapter.");
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

  const burnupCommand = command.command("burnup");
  burnupCommand.description("reports burnup");
  burnupCommand.option("--json", "Emit JSON output");
  burnupCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.burnup requires an explicit surface adapter.");
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

  const cfdCommand = command.command("cfd");
  cfdCommand.description("reports cfd");
  cfdCommand.option("--json", "Emit JSON output");
  cfdCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.cfd requires an explicit surface adapter.");
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

  const cycleTimeCommand = command.command("cycle-time");
  cycleTimeCommand.description("reports cycleTime");
  cycleTimeCommand.option("--json", "Emit JSON output");
  cycleTimeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.cycleTime requires an explicit surface adapter.");
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

  const exportCsvCommand = command.command("export-csv");
  exportCsvCommand.description("reports exportCsv");
  exportCsvCommand.option("--json", "Emit JSON output");
  exportCsvCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.exportCsv requires an explicit surface adapter.");
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

  const leadTimeCommand = command.command("lead-time");
  leadTimeCommand.description("reports leadTime");
  leadTimeCommand.option("--json", "Emit JSON output");
  leadTimeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.leadTime requires an explicit surface adapter.");
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

  const progressRollupCommand = command.command("progress-rollup");
  progressRollupCommand.description("reports progressRollup");
  progressRollupCommand.option("--json", "Emit JSON output");
  progressRollupCommand.option("--org-id <string>", "org-id");
  progressRollupCommand.option("--scope-id <string>", "scope-id");
  progressRollupCommand.addOption(new Option("--scope-type <choice>", "scope-type").choices(["sprint","project","epic","workspace"]));
  progressRollupCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.progressRollup requires an explicit surface adapter.");
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

  const staleIssuesCommand = command.command("stale-issues");
  staleIssuesCommand.description("reports staleIssues");
  staleIssuesCommand.option("--json", "Emit JSON output");
  staleIssuesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.staleIssues requires an explicit surface adapter.");
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

  const throughputCommand = command.command("throughput");
  throughputCommand.description("reports throughput");
  throughputCommand.option("--json", "Emit JSON output");
  throughputCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.throughput requires an explicit surface adapter.");
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

  const velocityCommand = command.command("velocity");
  velocityCommand.description("reports velocity");
  velocityCommand.option("--json", "Emit JSON output");
  velocityCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.velocity requires an explicit surface adapter.");
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

  const wipOverTimeCommand = command.command("wip-over-time");
  wipOverTimeCommand.description("reports wipOverTime");
  wipOverTimeCommand.option("--json", "Emit JSON output");
  wipOverTimeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.wipOverTime requires an explicit surface adapter.");
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

  const workloadCommand = command.command("workload");
  workloadCommand.description("reports workload");
  workloadCommand.option("--json", "Emit JSON output");
  workloadCommand.option("--org-id <string>", "org-id");
  workloadCommand.option("--scope-id <string>", "scope-id");
  workloadCommand.addOption(new Option("--scope-type <choice>", "scope-type").choices(["sprint","project","epic","workspace"]));
  workloadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.workload requires an explicit surface adapter.");
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
