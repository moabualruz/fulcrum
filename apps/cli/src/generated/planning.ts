import { Command, Option } from "commander";

export function createPlanningCommand(): Command {
  const command = new Command("planning");
  command.description("Generated planning commands.");

  const buildFreeformDocsPlanningPromptCommand = command.command("build-freeform-docs-planning-prompt");
  buildFreeformDocsPlanningPromptCommand.description("planning buildFreeformDocsPlanningPrompt");
  buildFreeformDocsPlanningPromptCommand.option("--json", "Emit JSON output");
  buildFreeformDocsPlanningPromptCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.buildFreeformDocsPlanningPrompt requires an explicit surface adapter.");
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

  const generateTechnicalPlanningCycleCommand = command.command("generate-technical-planning-cycle");
  generateTechnicalPlanningCycleCommand.description("planning generateTechnicalPlanningCycle");
  generateTechnicalPlanningCycleCommand.option("--json", "Emit JSON output");
  generateTechnicalPlanningCycleCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.generateTechnicalPlanningCycle requires an explicit surface adapter.");
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

  const materializeApprovedPlanBreakdownCommand = command.command("materialize-approved-plan-breakdown");
  materializeApprovedPlanBreakdownCommand.description("planning materializeApprovedPlanBreakdown");
  materializeApprovedPlanBreakdownCommand.option("--json", "Emit JSON output");
  materializeApprovedPlanBreakdownCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.materializeApprovedPlanBreakdown requires an explicit surface adapter.");
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

  const previewApprovedPlanBreakdownCommand = command.command("preview-approved-plan-breakdown");
  previewApprovedPlanBreakdownCommand.description("planning previewApprovedPlanBreakdown");
  previewApprovedPlanBreakdownCommand.option("--json", "Emit JSON output");
  previewApprovedPlanBreakdownCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.previewApprovedPlanBreakdown requires an explicit surface adapter.");
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

  const restartPlanningCycleFromUpdatesCommand = command.command("restart-planning-cycle-from-updates");
  restartPlanningCycleFromUpdatesCommand.description("planning restartPlanningCycleFromUpdates");
  restartPlanningCycleFromUpdatesCommand.option("--json", "Emit JSON output");
  restartPlanningCycleFromUpdatesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.restartPlanningCycleFromUpdates requires an explicit surface adapter.");
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

  const startFreeformWorkFromDocsCommand = command.command("start-freeform-work-from-docs");
  startFreeformWorkFromDocsCommand.description("planning startFreeformWorkFromDocs");
  startFreeformWorkFromDocsCommand.option("--json", "Emit JSON output");
  startFreeformWorkFromDocsCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.startFreeformWorkFromDocs requires an explicit surface adapter.");
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

  const startGuidedAcpPlanningSessionCommand = command.command("start-guided-acp-planning-session");
  startGuidedAcpPlanningSessionCommand.description("planning startGuidedAcpPlanningSession");
  startGuidedAcpPlanningSessionCommand.option("--json", "Emit JSON output");
  startGuidedAcpPlanningSessionCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for planning.startGuidedAcpPlanningSession requires an explicit surface adapter.");
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
