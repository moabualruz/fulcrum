// Agent envelope types — JSON shapes that hook subcommands receive on stdin.
// Spec source: docs/hooks.md §1.

export type Tier =
  | "raw"
  | "status-only"
  | "summary+head"
  | "summary+file"
  | "file-only"
  | "leave-as-is";

export interface ToolResponse {
  stdout?: string;
  stderr?: string;
  output?: string;
  exit_code?: number;
  returncode?: number;
}

export interface HookEvent {
  tool_name?: string;
  tool_input?: {
    command?: string;
    file_path?: string;
    [k: string]: unknown;
  };
  tool_response?: ToolResponse;
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  [k: string]: unknown;
}

export interface PolicyProfile {
  tier?: Tier;
  tier_under?: Tier;
  tier_over?: Tier;
  threshold_bytes?: number;
}

export interface ToolPolicy extends PolicyProfile {
  profile?: string;
}

export interface PolicyDoc {
  default?: PolicyProfile;
  profiles?: Record<string, PolicyProfile>;
  tools?: Record<string, ToolPolicy>;
}
