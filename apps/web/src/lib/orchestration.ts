export type SymphonyState =
  | "pending"
  | "dispatched"
  | "running"
  | "stalled"
  | "succeeded"
  | "failed"
  | "cancelled";

export const SYMPHONY_COLORS: Record<SymphonyState, string> = {
  pending: "bg-muted text-muted-foreground",
  dispatched: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  running: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  stalled: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};
