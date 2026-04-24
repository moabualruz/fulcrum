import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listAgentProfiles, runRealAgentPrompt, type AgentProfile } from "@fulcrum/agents";
import {
  AgentCertificationService,
  LocalTaskService,
  RunLifecycleService,
  captureRunTranscript,
  type AgentAcceptanceEvidence,
  type RunRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import { makeId, type Run, type RunEvent, type Task } from "@fulcrum/shared";

export interface ReleaseAgentAcceptanceInput {
  cwd: string;
  evidenceDir: string;
  prompt?: string;
  timeoutMs?: number;
  requiredAgents?: number;
  agentIds?: string[];
}

class MemoryTaskRepository implements TaskRepositoryPort {
  private readonly tasks = new Map<string, Task>();

  save(task: Task): Task {
    this.tasks.set(task.taskId, task);
    return task;
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  list(projectId?: string): Task[] {
    return [...this.tasks.values()].filter((task) => !projectId || task.projectId === projectId);
  }
}

class MemoryRunRepository implements RunRepositoryPort {
  private readonly runs = new Map<string, Run>();
  private readonly events: RunEvent[] = [];

  save(run: Run): Run {
    this.runs.set(run.runId, run);
    return run;
  }

  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  list(projectId?: string): Run[] {
    return [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
  }

  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }

  listEvents(runId: string): RunEvent[] {
    return this.events.filter((event) => event.runId === runId);
  }
}

export async function runReleaseAgentAcceptance(input: ReleaseAgentAcceptanceInput) {
  const evidenceRoot = path.resolve(input.evidenceDir);
  const agentsDir = path.join(evidenceRoot, "agents");
  await mkdir(agentsDir, { recursive: true });

  const selected = selectProfiles(input.agentIds);
  const taskRepository = new MemoryTaskRepository();
  const runRepository = new MemoryRunRepository();
  const tasks = new LocalTaskService(taskRepository);
  const runs = new RunLifecycleService(runRepository, taskRepository);
  const certification = new AgentCertificationService(selected);
  const prompt =
    input.prompt ??
    "Fulcrum release acceptance: report whether this CLI agent can inspect this repository and return a short lifecycle validation note.";
  const projectId = makeId("proj", `release-agent-acceptance-${path.basename(path.resolve(input.cwd))}`);

  const executions = await Promise.all(
    selected.map((profile) =>
      runReleaseAgent(profile, {
        cwd: input.cwd,
        agentsDir,
        prompt,
        timeoutMs: input.timeoutMs,
        projectId,
        tasks,
        runs,
        certification
      })
    )
  );

  const certificationReport = await certification.certify({
    cwd: input.cwd,
    acceptanceEvidence: executions.map((execution) => execution.evidence),
    requiredRealAgentCount: input.requiredAgents ?? 2
  });
  const report = {
    schemaVersion: "1.0",
    checkId: "agents.real-cli-acceptance",
    status: certificationReport.pass
      ? "passed"
      : executions.some((execution) => execution.result.status === "failed")
        ? "failed"
        : "guided",
    pass: certificationReport.pass,
    evidenceRoot,
    realAgentCount: certificationReport.realAgentCount,
    requiredRealAgentCount: certificationReport.requiredRealAgentCount,
    evidenceRefs: certificationReport.evidenceRefs,
    runs: executions.map((execution) => execution.report),
    certifications: certificationReport.certifications,
    nextActions: certificationReport.nextActions
  };
  await writeFile(path.join(agentsDir, "certification.json"), JSON.stringify(report, null, 2));
  return report;
}

async function runReleaseAgent(
  profile: AgentProfile,
  input: {
    cwd: string;
    agentsDir: string;
    prompt: string;
    timeoutMs?: number;
    projectId: string;
    tasks: LocalTaskService;
    runs: RunLifecycleService;
    certification: AgentCertificationService;
  }
): Promise<{
  result: Awaited<ReturnType<typeof runRealAgentPrompt>>;
  report: {
    agentId: string;
    command: string;
    status: "passed" | "failed" | "guided";
    taskId: string;
    runId: string;
    contextPackId: string;
    worktreeId: string;
    transcriptArtifactId: string;
    agentEvidenceArtifactId: string;
    qualityGateIds: string[];
    policyDecisionIds: string[];
    artifactIds: string[];
    memoryRecommendation: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    summary: string;
  };
  evidence: AgentAcceptanceEvidence;
}> {
  const task = input.tasks.create({
    projectId: input.projectId,
    title: `Release agent acceptance: ${profile.agentId}`
  });
  input.tasks.transition(task.taskId, "ready");

  const seed = `${profile.agentId}-${Date.now()}`;
  const run = input.runs.start({
    taskId: task.taskId,
    agentId: profile.agentId,
    commandIdentity: profile.command,
    worktreeId: makeId("wt", `${seed}-worktree`),
    contextPackId: makeId("ctx", `${seed}-context`),
    allocateWorktree: false
  });
  const result = await runRealAgentPrompt({
    profile,
    prompt: input.prompt,
    cwd: input.cwd,
    timeoutMs: input.timeoutMs
  });
  const transcript = captureRunTranscript({
    runId: run.runId,
    logRoot: path.join(input.agentsDir, "logs"),
    lines: buildTranscript(result)
  });
  const qualityGateId = makeId("gate", `${run.runId}-release-agent-acceptance`);
  const policyDecisionId = makeId("pol", `${run.runId}-local-only`);
  const evidenceRef = path.join(input.agentsDir, `${profile.agentId}.json`);
  const agentEvidenceArtifactId = input.certification.recordEvidenceAsRunArtifact({
    runId: run.runId,
    agentId: profile.agentId,
    evidenceRef
  });
  const completed = input.runs.complete(run.runId, {
    summary: summarizeRun(result),
    outcome: result.status === "passed" ? "succeeded" : "failed",
    artifactIds: [transcript.artifactId],
    logArtifactIds: [transcript.artifactId],
    qualityGateIds: [qualityGateId],
    policyDecisionIds: [policyDecisionId],
    agentEvidenceArtifactIds: [agentEvidenceArtifactId]
  });
  const memoryRecommendation =
    result.status === "passed"
      ? "Consider promoting transcript summary into durable operator memory after review."
      : "Do not promote this transcript into durable memory until command, auth, and policy issues are resolved.";
  const report = {
    agentId: profile.agentId,
    command: result.command,
    status: result.status,
    taskId: task.taskId,
    runId: completed.runId,
    contextPackId: completed.contextPackId ?? run.contextPackId ?? "",
    worktreeId: completed.worktreeId ?? run.worktreeId ?? "",
    transcriptArtifactId: transcript.artifactId,
    agentEvidenceArtifactId,
    qualityGateIds: completed.qualityGateIds,
    policyDecisionIds: completed.policyDecisionIds,
    artifactIds: completed.artifactIds,
    memoryRecommendation,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    summary: completed.summary ?? summarizeRun(result)
  };
  await writeFile(
    evidenceRef,
    JSON.stringify(
      {
        schemaVersion: "1.0",
        task,
        run: completed,
        transcriptArtifact: transcript,
        agentEvidenceArtifactId,
        memoryRecommendation,
        result
      },
      null,
      2
    )
  );
  return {
    result,
    report,
    evidence: {
      agentId: profile.agentId,
      status: result.status,
      evidenceRef,
      runId: completed.runId
    }
  };
}

function buildTranscript(result: Awaited<ReturnType<typeof runRealAgentPrompt>>): string[] {
  const lines = [
    `command: ${result.command}`,
    `args: ${result.args.join(" ") || "(none)"}`,
    `cwd: ${result.cwd}`,
    `status: ${result.status}`
  ];
  if (result.stdout.trim()) {
    lines.push(...result.stdout.trim().split(/\r?\n/).map((line) => `stdout: ${line}`));
  }
  if (result.stderr.trim()) {
    lines.push(...result.stderr.trim().split(/\r?\n/).map((line) => `stderr: ${line}`));
  }
  if (result.nextAction) {
    lines.push(`next-action: ${result.nextAction}`);
  }
  return lines;
}

function summarizeRun(result: Awaited<ReturnType<typeof runRealAgentPrompt>>): string {
  if (result.status === "passed") {
    return `${result.agentId} completed release agent acceptance.`;
  }
  return result.nextAction ?? `${result.agentId} did not complete release agent acceptance.`;
}

function selectProfiles(agentIds?: string[]): AgentProfile[] {
  const profiles = listAgentProfiles();
  if (!agentIds || agentIds.length === 0) {
    return profiles.filter((profile) => profile.agentId !== "agent_generic");
  }
  const selected = agentIds.map((agentId) => {
    const profile = profiles.find((item) => item.agentId === agentId);
    if (!profile) {
      throw new Error(`Unknown agent profile: ${agentId}`);
    }
    return profile;
  });
  if (selected.length < 2) {
    throw new Error("Real-agent acceptance requires at least two selected agent profiles.");
  }
  return selected;
}
