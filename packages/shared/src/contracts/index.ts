export * from "./common.js";

export const CLI_COMMANDS = [
  "setup",
  "doctor",
  "repair",
  "uninstall",
  "project",
  "task",
  "run",
  "context",
  "memory",
  "code",
  "worktree",
  "gate",
  "artifact",
  "policy",
  "backup",
  "restore",
  "rebuild",
  "export",
  "reset"
] as const;

export const API_BASE_PATH = "/api/v1";

export const MCP_TOOL_NAMES = [
  "fulcrum_doctor_status",
  "fulcrum_project_list",
  "fulcrum_task_get",
  "fulcrum_task_list",
  "fulcrum_run_start",
  "fulcrum_run_heartbeat",
  "fulcrum_context_build",
  "fulcrum_memory_search",
  "fulcrum_code_search",
  "fulcrum_policy_check"
] as const;
