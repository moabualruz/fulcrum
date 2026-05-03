import { Command } from "commander";

export function createReportsCommand(): Command {
  const command = new Command("reports");
  command.description("Project reports (burndown, velocity, etc.).");

  const burndownCommand = command.command("burndown");
  burndownCommand.description("Show burndown chart data for a sprint");
  burndownCommand.requiredOption("--project <string>", "Project ID");
  burndownCommand.requiredOption("--sprint <string>", "Sprint ID");
  burndownCommand.option("--json", "Emit JSON output");
  burndownCommand.action(async (options) => {
    try {
      // Resolve tRPC caller from local server
      const { createLocalCaller } = await import("../local-caller.ts");
      const caller = await createLocalCaller();
      const result = await caller.reports.burndown({
        projectId: options.project,
        sprintId: options.sprint,
      });

      if (options.json === true) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.length === 0) {
          console.log("No burndown data available.");
          return;
        }
        console.log("Date         Remaining  Ideal");
        console.log("─".repeat(35));
        for (const point of result) {
          console.log(
            `${point.date}  ${String(point.pointsRemaining).padStart(9)}  ${String(point.ideal).padStart(5)}`,
          );
        }
      }
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
