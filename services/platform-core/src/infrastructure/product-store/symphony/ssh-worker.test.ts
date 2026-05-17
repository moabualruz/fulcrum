import { describe, expect, test } from "bun:test";
import {
  buildSshCommand,
  escapeShellArg,
  parseSshWorkerConfig,
  type SshWorkerConfig,
  type SshDispatchInput,
} from "./ssh-worker.ts";

const testConfig: SshWorkerConfig = {
  sshHost: "worker-1.local",
  sshUser: "agent",
  sshKeyPath: "/home/agent/.ssh/id_ed25519",
  remoteWorkspaceRoot: "/var/fulcrum/workspaces",
};

const testInput: SshDispatchInput = {
  runId: "run-1",
  taskId: "task-1",
  workspaceKey: "MT-649",
  prompt: "Fix the login bug",
  agent: "codex",
};

describe("SSH worker", () => {
  test("buildSshCommand produces correct ssh invocation", () => {
    const cmd = buildSshCommand(testConfig, testInput);
    expect(cmd[0]).toBe("ssh");
    expect(cmd).toContain("-i");
    expect(cmd).toContain("/home/agent/.ssh/id_ed25519");
    expect(cmd).toContain("-l");
    expect(cmd).toContain("agent");
    expect(cmd).toContain("worker-1.local");
    // Remote command should reference remote workspace path
    const remoteCmd = cmd[cmd.length - 1]!;
    expect(remoteCmd).toContain("/var/fulcrum/workspaces/MT-649");
    expect(remoteCmd).toContain("codex");
  });

  test("buildSshCommand escapes single quotes in prompt", () => {
    const input = { ...testInput, prompt: "Fix the user's login" };
    const cmd = buildSshCommand(testConfig, input);
    const remoteCmd = cmd[cmd.length - 1]!;
    // Should not contain unescaped single quote within shell string
    expect(remoteCmd).toContain("user'\\''s");
  });

  test("escapeShellArg handles empty string", () => {
    expect(escapeShellArg("")).toBe("");
  });

  test("escapeShellArg handles no quotes", () => {
    expect(escapeShellArg("hello world")).toBe("hello world");
  });

  test("escapeShellArg handles multiple quotes", () => {
    expect(escapeShellArg("it's a 'test'")).toBe("it'\\''s a '\\''test'\\''");
  });
});

describe("SSH worker config parsing", () => {
  test("parseSshWorkerConfig returns config for valid input", () => {
    const config = parseSshWorkerConfig({
      ssh_host: "worker-1.local",
      ssh_user: "agent",
      ssh_key_path: "/path/to/key",
      remote_workspace_root: "/var/workspaces",
    });
    expect(config).not.toBeNull();
    expect(config!.sshHost).toBe("worker-1.local");
    expect(config!.sshUser).toBe("agent");
    expect(config!.remoteWorkspaceRoot).toBe("/var/workspaces");
  });

  test("parseSshWorkerConfig returns null for missing fields", () => {
    expect(parseSshWorkerConfig({})).toBeNull();
    expect(parseSshWorkerConfig({ ssh_host: "x" })).toBeNull();
    expect(parseSshWorkerConfig({ ssh_host: "x", ssh_user: "y" })).toBeNull();
  });

  test("parseSshWorkerConfig falls back to workspace_root", () => {
    const config = parseSshWorkerConfig({
      ssh_host: "h",
      ssh_user: "u",
      ssh_key_path: "/k",
      workspace_root: "/fallback",
    });
    expect(config).not.toBeNull();
    expect(config!.remoteWorkspaceRoot).toBe("/fallback");
  });

  test("parseSshWorkerConfig reads max_concurrent", () => {
    const config = parseSshWorkerConfig({
      ssh_host: "h",
      ssh_user: "u",
      ssh_key_path: "/k",
      remote_workspace_root: "/w",
      max_concurrent: 4,
    });
    expect(config!.maxConcurrent).toBe(4);
  });
});
