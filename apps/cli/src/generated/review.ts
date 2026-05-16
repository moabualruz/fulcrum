import { Command, Option } from "commander";

export function createReviewCommand(): Command {
  const command = new Command("review");
  command.description("Generated review commands.");

  const applyAutoDecisionCommand = command.command("apply-auto-decision");
  applyAutoDecisionCommand.description("review applyAutoDecision");
  applyAutoDecisionCommand.option("--json", "Emit JSON output");
  applyAutoDecisionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for review.applyAutoDecision requires an explicit surface adapter.");
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

  const buildUatHandoffCommand = command.command("build-uat-handoff");
  buildUatHandoffCommand.description("review buildUatHandoff");
  buildUatHandoffCommand.option("--json", "Emit JSON output");
  buildUatHandoffCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for review.buildUatHandoff requires an explicit surface adapter.");
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

  const recordUatDecisionCommand = command.command("record-uat-decision");
  recordUatDecisionCommand.description("review recordUatDecision");
  recordUatDecisionCommand.option("--json", "Emit JSON output");
  recordUatDecisionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for review.recordUatDecision requires an explicit surface adapter.");
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
