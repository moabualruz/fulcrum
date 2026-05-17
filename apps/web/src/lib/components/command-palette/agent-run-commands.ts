/**
 * Command palette entries for agent and run actions.
 * Each command resolves to a tRPC mutation descriptor.
 */

export interface CommandAction {
  mutation: string;
  args: Record<string, string>;
}

export interface ActionCommandItem {
  id: string;
  label: string;
  resolve: () => CommandAction;
}

export function agentTestCommand(name: string): ActionCommandItem {
  return {
    id: `agents-test-${name}`,
    label: `agents test ${name}`,
    resolve: () => ({
      mutation: "agents.testProfile",
      args: { name },
    }),
  };
}

export function runsCancelCommand(runId: string): ActionCommandItem {
  return {
    id: `runs-cancel-${runId}`,
    label: `runs cancel ${runId}`,
    resolve: () => ({
      mutation: "runs.cancel",
      args: { id: runId },
    }),
  };
}

export function runsRetryCommand(runId: string): ActionCommandItem {
  return {
    id: `runs-retry-${runId}`,
    label: `runs retry ${runId}`,
    resolve: () => ({
      mutation: "runs.retry",
      args: { id: runId },
    }),
  };
}
