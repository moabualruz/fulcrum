import { installToolOutputPolicy } from "../../cli/install.ts";
import { removeToolOutputPolicy } from "../../cli/uninstall.ts";
import type { Operation } from "../types.ts";

type PolicyOperation = Exclude<Operation, "status">;

export async function applyPolicyAction(
  operation: PolicyOperation,
  dryRun: boolean,
  purge = false,
): Promise<void> {
  switch (operation) {
    case "install":
    case "enable":
      await installToolOutputPolicy(dryRun);
      return;
    case "remove":
    case "disable":
      await removeToolOutputPolicy(purge, dryRun);
      return;
  }
}
