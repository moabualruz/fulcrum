import { z } from "zod";

export const localReadinessStatusSchema = z.enum(["pass", "repairable", "reset-required"]);

export type LocalReadinessStatus = z.infer<typeof localReadinessStatusSchema>;

export interface LocalStateResetPlan {
  status: "reset-required";
  fulcrumHome: string;
  canExecute: boolean;
  requiredFlag: "--yes-reset-local-state";
  message: string;
}

export function resetPlanForFulcrumHome(
  fulcrumHome: string,
  options: { confirm: boolean },
): LocalStateResetPlan {
  if (!fulcrumHome.trim()) throw new Error("FULCRUM_HOME is required for local reset planning.");
  return {
    status: "reset-required",
    fulcrumHome,
    canExecute: options.confirm,
    requiredFlag: "--yes-reset-local-state",
    message: options.confirm
      ? `Reset allowed for FULCRUM_HOME=${fulcrumHome}.`
      : `Refusing to reset FULCRUM_HOME=${fulcrumHome} without --yes-reset-local-state.`,
  };
}
