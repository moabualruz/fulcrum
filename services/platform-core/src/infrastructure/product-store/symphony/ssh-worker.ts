/**
 * SSH Worker Extension — gated by FULCRUM_FEATURES=symphony-ssh-worker.
 *
 * Dispatches agent runs to remote hosts via SSH stdio.
 * Config from WORKFLOW.md: ssh_host, ssh_user, ssh_key_path.
 * workspace.root interpreted on remote host, not orchestrator.
 */

export interface SshWorkerConfig {
  sshHost: string;
  sshUser: string;
  sshKeyPath: string;
  /** workspace.root on the remote host */
  remoteWorkspaceRoot: string;
  /** Max concurrent agents on this host */
  maxConcurrent?: number;
}

export interface SshDispatchInput {
  runId: string;
  taskId: string;
  workspaceKey: string;
  prompt: string;
  agent: string;
}

export interface SshDispatchResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  remotePath: string;
}

/**
 * Build the SSH command array for dispatching an agent run.
 * The coding-agent is launched over SSH stdio — orchestrator owns session lifecycle.
 */
export function buildSshCommand(
  config: SshWorkerConfig,
  input: SshDispatchInput,
): string[] {
  const remotePath = `${config.remoteWorkspaceRoot}/${input.workspaceKey}`;
  return [
    "ssh",
    "-o", "StrictHostKeyChecking=accept-new",
    "-i", config.sshKeyPath,
    "-l", config.sshUser,
    config.sshHost,
    "--",
    // Remote command: create workspace dir, run agent
    `mkdir -p ${remotePath} && cd ${remotePath} && echo '${escapeShellArg(input.prompt)}' | ${input.agent} --stdin`,
  ];
}

/** Escape single quotes for shell argument safety. */
export function escapeShellArg(arg: string): string {
  return arg.replace(/'/g, "'\\''");
}

/**
 * Dispatch a run to a remote host via SSH.
 * Uses Bun.spawn for the SSH subprocess.
 */
export async function dispatchSshWorker(
  config: SshWorkerConfig,
  input: SshDispatchInput,
): Promise<SshDispatchResult> {
  const cmd = buildSshCommand(config, input);
  const remotePath = `${config.remoteWorkspaceRoot}/${input.workspaceKey}`;

  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr, remotePath };
}

/**
 * Parse SSH worker config from WORKFLOW.md config object.
 * Returns null if required fields missing.
 */
export function parseSshWorkerConfig(
  config: Record<string, unknown>,
): SshWorkerConfig | null {
  const host = config.ssh_host;
  const user = config.ssh_user;
  const keyPath = config.ssh_key_path;
  const root = config.remote_workspace_root ?? config.workspace_root;

  if (
    typeof host !== "string" || !host ||
    typeof user !== "string" || !user ||
    typeof keyPath !== "string" || !keyPath ||
    typeof root !== "string" || !root
  ) {
    return null;
  }

  return {
    sshHost: host,
    sshUser: user,
    sshKeyPath: keyPath,
    remoteWorkspaceRoot: root,
    maxConcurrent: typeof config.max_concurrent === "number" ? config.max_concurrent : undefined,
  };
}
