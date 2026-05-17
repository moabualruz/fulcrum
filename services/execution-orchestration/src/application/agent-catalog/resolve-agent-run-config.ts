/**
 * resolveAgentRunConfig — merges WORKFLOW.md overrides with persisted
 * AgentProfile defaults for dispatch.
 *
 * Priority (highest to lowest):
 *   1. workflowOverride fields (from WORKFLOW.md)
 *   2. persistedProfile fields (loaded from registry/DB)
 *
 * All supported agents can be dispatch-capable primaries when their profile
 * contract is satisfied; workflow front matter can override profile defaults.
 */

import { getProfile, UnknownAgentError } from "./registry.ts";
import type { AgentProfile, SandcastleProvider } from "./types.ts";

/**
 * Fields that WORKFLOW.md can override on an agent profile.
 * All fields are optional — absence means "use profile default".
 */
export interface WorkflowAgentOverride {
  /** Override the CLI command/path used to launch the agent. */
  readonly command?: string;
  /** Override the model identifier passed to the agent. */
  readonly model?: string;
  /** Override the approval policy. */
  readonly approvalPolicy?: string;
  /** Override the sandbox provider. */
  readonly sandcastleProvider?: SandcastleProvider;
}

/**
 * Resolved agent run configuration ready for dispatch.
 */
export interface ResolvedAgentRunConfig {
  /** The resolved agent name (from registry). */
  readonly agentName: string;
  /** Full merged profile (base + overrides applied). */
  readonly profile: AgentProfile;
  /**
   * Effective CLI command for launching the agent.
   * Defaults to profile.cliPath; overridden by workflowOverride.command.
   */
  readonly command: string;
  /** Optional model override from WORKFLOW.md (undefined if not set). */
  readonly model?: string;
  /** Optional approval policy override (undefined if not set). */
  readonly approvalPolicy?: string;
  /**
   * Effective sandbox provider.
   * Defaults to profile.sandcastleProvider; overridden by workflowOverride.sandcastleProvider.
   */
  readonly sandcastleProvider: SandcastleProvider;
}

export interface ResolveAgentRunConfigOptions {
  /**
   * Requested agent name (e.g. "codex", "claude-code", "opencode", "gemini-cli", "pi").
   * Defaults to "codex" if omitted.
   */
  readonly requestedAgent?: string;
  /** Overrides from WORKFLOW.md front matter. */
  readonly workflowOverride: WorkflowAgentOverride;
  /**
   * Optional pre-loaded profile. If omitted, looked up from the global registry.
   * Useful for testing with custom profiles.
   */
  readonly persistedProfile?: AgentProfile;
}

/**
 * Resolve the effective agent run configuration for dispatch.
 *
 * Throws `UnknownAgentError` if `requestedAgent` is not in the registry.
 */
export function resolveAgentRunConfig(
  options: ResolveAgentRunConfigOptions,
): ResolvedAgentRunConfig {
  const agentName = options.requestedAgent ?? "codex";

  // Validate and load profile — throws UnknownAgentError if not found
  const profile = options.persistedProfile ?? getProfile(agentName);

  // Merge: WORKFLOW.md override wins over profile default
  const command = options.workflowOverride.command ?? profile.cliPath;
  const model = options.workflowOverride.model;
  const approvalPolicy = options.workflowOverride.approvalPolicy;
  const sandcastleProvider =
    options.workflowOverride.sandcastleProvider ?? profile.sandcastleProvider;

  return {
    agentName,
    profile,
    command,
    ...(model !== undefined ? { model } : {}),
    ...(approvalPolicy !== undefined ? { approvalPolicy } : {}),
    sandcastleProvider,
  };
}
