import { installRulesBlocks } from "@fulcrum/cli/install.ts";
import { removeRulesBlocks } from "@fulcrum/cli/uninstall.ts";
import type { Operation } from "../types.ts";

type RulesOperation = Exclude<Operation, "status">;

export async function applyRulesAction(operation: RulesOperation, dryRun: boolean): Promise<void> {
  const home = process.env["HOME"] ?? "";
  switch (operation) {
    case "install":
    case "enable":
      await installRulesBlocks(home, dryRun);
      return;
    case "remove":
    case "disable":
      await removeRulesBlocks(home, dryRun);
      return;
  }
}
