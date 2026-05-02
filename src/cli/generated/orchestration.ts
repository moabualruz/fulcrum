import { Command, Option } from "commander";

export function createOrchestrationCommand(): Command {
  const command = new Command("orchestration");
  command.description("Generated orchestration commands.");

  const claimRunCommand = command.command("claim-run");
  claimRunCommand.description("orchestration claimRun");
  claimRunCommand.option("--json", "Emit JSON output");
  claimRunCommand.option("--instance-id <string>", "instance-id");
  claimRunCommand.option("--org-id <string>", "org-id");
  claimRunCommand.option("--task-id <string>", "task-id");
  claimRunCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.claimRun is not wired yet.");
  });

  const fetchCandidateIssuesCommand = command.command("fetch-candidate-issues");
  fetchCandidateIssuesCommand.description("orchestration fetchCandidateIssues");
  fetchCandidateIssuesCommand.option("--json", "Emit JSON output");
  fetchCandidateIssuesCommand.option("--limit <number>", "limit", Number.parseFloat);
  fetchCandidateIssuesCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.fetchCandidateIssues is not wired yet.");
  });

  const fetchIssuesByStatesCommand = command.command("fetch-issues-by-states");
  fetchIssuesByStatesCommand.description("orchestration fetchIssuesByStates");
  fetchIssuesByStatesCommand.option("--json", "Emit JSON output");
  fetchIssuesByStatesCommand.option("--limit <number>", "limit", Number.parseFloat);
  fetchIssuesByStatesCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.fetchIssuesByStates is not wired yet.");
  });

  const fetchIssueStatesByIdsCommand = command.command("fetch-issue-states-by-ids");
  fetchIssueStatesByIdsCommand.description("orchestration fetchIssueStatesByIds");
  fetchIssueStatesByIdsCommand.option("--json", "Emit JSON output");
  fetchIssueStatesByIdsCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.fetchIssueStatesByIds is not wired yet.");
  });

  const getRunCommand = command.command("get-run");
  getRunCommand.description("orchestration getRun");
  getRunCommand.option("--json", "Emit JSON output");
  getRunCommand.option("--run-id <string>", "run-id");
  getRunCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.getRun is not wired yet.");
  });

  const getWorkspacePathCommand = command.command("get-workspace-path");
  getWorkspacePathCommand.description("orchestration getWorkspacePath");
  getWorkspacePathCommand.option("--json", "Emit JSON output");
  getWorkspacePathCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.getWorkspacePath is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("orchestration list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.list is not wired yet.");
  });

  const renderPromptPreviewCommand = command.command("render-prompt-preview");
  renderPromptPreviewCommand.description("orchestration renderPromptPreview");
  renderPromptPreviewCommand.option("--json", "Emit JSON output");
  renderPromptPreviewCommand.option("--attempt <number>", "attempt", Number.parseFloat);
  renderPromptPreviewCommand.option("--config-yaml <string>", "config-yaml");
  renderPromptPreviewCommand.option("--org-id <string>", "org-id");
  renderPromptPreviewCommand.option("--prompt-md <string>", "prompt-md");
  renderPromptPreviewCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orchestration.renderPromptPreview is not wired yet.");
  });

  return command;
}
