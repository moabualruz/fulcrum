import { Command } from "commander";
import {
  ArtifactService,
  externalPmHealth,
  LocalArtifactStorage,
  PolicyEnforcementService,
  resolveSetupPaths,
  type ArtifactRepositoryPort
} from "@fulcrum/core";
import {
  SCHEMA_VERSION,
  type ArtifactContract,
  type PolicyDecision,
  type RunEvent
} from "@fulcrum/shared";
import {
  attachArtifactCommand,
  listRunArtifactsCommand,
  showArtifactCommand
} from "./commands/artifact.js";
import { doctorCommand } from "./commands/doctor.js";
import { codeCleanupStaleCommand, codeSearchCommand } from "./commands/code.js";
import { listProjectsCommand, registerProjectCommand } from "./commands/project.js";
import {
  cancelRunCommand,
  runStatusCommand,
  startRunCommand,
  tailRunCommand
} from "./commands/run.js";
import { setupApplyCommand, setupPreviewCommand } from "./commands/setup.js";
import { createTaskCommand, listTasksCommand, transitionTaskCommand } from "./commands/task.js";
import {
  disablePlaneCommand,
  decidePlaneWritebackCommand,
  importPlaneCommand,
  linkPlaneTaskCommand,
  listPlaneMirrorsCommand,
  previewPlaneWritebackCommand,
  syncPlaneCommand
} from "./commands/plane.js";
import { approvePolicyCommand, checkPolicyCommand } from "./commands/policy.js";
import { formatRedactionStatus } from "./output/redaction.js";
import { createCliSetupPorts } from "./runtime.js";
import {
  codeService,
  externalPmService,
  projectService,
  runService,
  taskService
} from "./work-runtime.js";

class MemoryArtifactRepository implements ArtifactRepositoryPort {
  private readonly artifacts = new Map<string, ArtifactContract>();

  save(artifact: ArtifactContract): ArtifactContract {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  get(artifactId: string): ArtifactContract | undefined {
    return this.artifacts.get(artifactId);
  }

  listByRun(runId: string): ArtifactContract[] {
    return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
  }
}

class MemoryPolicyDecisionRepository {
  private readonly decisions = new Map<string, PolicyDecision>();

  save(decision: PolicyDecision): PolicyDecision {
    this.decisions.set(decision.policyDecisionId, decision);
    return decision;
  }

  get(policyDecisionId: string): PolicyDecision | undefined {
    return this.decisions.get(policyDecisionId);
  }

  listPending(): PolicyDecision[] {
    return [...this.decisions.values()].filter(
      (decision) => decision.status === "approval_required"
    );
  }
}

class MemoryPolicyEventRepository {
  private sequence = 0;

  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent {
    return { ...event, sequence: event.sequence ?? this.sequence++ };
  }
}

const program = new Command();

program
  .name("fulcrum")
  .description("Local-first CLI Agent OS")
  .version("0.1.0")
  .option("--json", "emit machine-readable JSON")
  .option("--config <path>", "use explicit Fulcrum config file")
  .option("--local-only", "deny remote actions unless policy allows");

const setupCommand = program.command("setup").description("Preview or apply local setup");

setupCommand
  .command("preview")
  .description("Show setup effects without mutation")
  .action(() => {
    const payload = setupPreviewCommand();
    console.log(
      program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup preview ready"
    );
  });

setupCommand
  .command("apply")
  .description("Apply local setup")
  .action(async () => {
    const ports = await createCliSetupPorts();
    const payload = await setupApplyCommand(ports);
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup applied");
  });

program
  .command("setup:preview")
  .description("Compatibility alias for setup preview")
  .action(() => {
    const payload = setupPreviewCommand();
    console.log(
      program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup preview ready"
    );
  });

program
  .command("setup:apply")
  .description("Compatibility alias for setup apply")
  .action(async () => {
    const ports = await createCliSetupPorts();
    const payload = await setupApplyCommand(ports);
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum setup applied");
  });

program
  .command("doctor")
  .description("Report local capability and privacy health")
  .option("--no-network", "avoid network checks")
  .action(async (options) => {
    const ports = await createCliSetupPorts();
    const payload = doctorCommand({
      setupRepository: ports.setupRepository,
      setupState: await ports.latest(),
      noNetwork: options.network === false || Boolean(options.noNetwork),
      extraCapabilities: [await externalPmHealth(externalPmService.adapterHealthPort())]
    });
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum doctor ready");
  });

const artifactService = new ArtifactService(
  new MemoryArtifactRepository(),
  new LocalArtifactStorage(resolveSetupPaths().artifactRoot)
);
const policyService = new PolicyEnforcementService(
  new MemoryPolicyDecisionRepository(),
  new MemoryPolicyEventRepository()
);
const artifactCommand = program.command("artifact").description("Attach, show, or list artifacts");

artifactCommand
  .command("attach")
  .requiredOption("--type <type>")
  .requiredOption("--local-ref <path>")
  .requiredOption("--summary <summary>")
  .option("--run <runId>")
  .option("--task <taskId>")
  .option("--project <projectId>")
  .action(async (options) => {
    const data = await attachArtifactCommand(
      { artifacts: artifactService },
      {
        type: options.type,
        localRef: options.localRef,
        summary: options.summary,
        runId: options.run,
        taskId: options.task,
        projectId: options.project
      }
    );
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.artifactId
    );
  });

artifactCommand.command("show <artifactId>").action((artifactId) => {
  const data = showArtifactCommand({ artifacts: artifactService }, artifactId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: data ? "ok" : "error", data }, null, 2)
      : (data?.summary ?? "Artifact not found")
  );
});

artifactCommand
  .command("list")
  .requiredOption("--run <runId>")
  .action((options) => {
    const data = listRunArtifactsCommand({ artifacts: artifactService }, options.run);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} artifacts`
    );
  });

const projectCommand = program.command("project").description("Register and list local projects");

projectCommand
  .command("register <rootPath>")
  .option("--name <name>")
  .action((rootPath, options) => {
    const data = registerProjectCommand(projectService, { rootPath, name: options.name });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.projectId
    );
  });

projectCommand.command("list").action(() => {
  const data = listProjectsCommand(projectService);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : `${data.length} projects`
  );
});

const taskCommand = program.command("task").description("Create, list, and transition local tasks");

taskCommand
  .command("create")
  .requiredOption("--project <projectId>")
  .requiredOption("--title <title>")
  .option("--description <description>")
  .option("--priority <priority>")
  .option("--label <label...>")
  .action((options) => {
    const data = createTaskCommand(taskService, {
      projectId: options.project,
      title: options.title,
      description: options.description,
      priority: options.priority,
      labels: options.label
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.taskId
    );
  });

taskCommand
  .command("list")
  .option("--project <projectId>")
  .action((options) => {
    const data = listTasksCommand(taskService, options.project);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} tasks`
    );
  });

taskCommand.command("transition <taskId> <status>").action((taskId, status) => {
  const data = transitionTaskCommand(taskService, taskId, status);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : data.status
  );
});

const codeCommand = program.command("code").description("Search local code evidence");

codeCommand
  .command("search <query>")
  .requiredOption("--project <projectId>")
  .option("--limit <limit>")
  .option("--semantic", "include semantic degraded state")
  .action(async (query, options) => {
    const data = await codeSearchCommand(codeService, {
      projectId: options.project,
      query,
      limit: options.limit ? Number(options.limit) : undefined,
      semantic: Boolean(options.semantic)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.count} code evidence results`
    );
  });

codeCommand
  .command("files <pattern>")
  .requiredOption("--project <projectId>")
  .action(async (pattern, options) => {
    const data = await codeSearchCommand(codeService, {
      projectId: options.project,
      query: pattern,
      limit: 50
    });
    const fileResults = data.evidence.filter((item) =>
      ["path", "filename"].includes(item.evidenceType)
    );
    console.log(
      program.opts().json
        ? JSON.stringify(
            { schemaVersion: "1.0", status: "ok", data: { ...data, evidence: fileResults } },
            null,
            2
          )
        : `${fileResults.length} files`
    );
  });

codeCommand
  .command("cleanup-stale")
  .requiredOption("--project <projectId>")
  .action((options) => {
    const data = codeCleanupStaleCommand(codeService, options.project);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} stale evidence records`
    );
  });

const runCommand = program.command("run").description("Start, inspect, cancel, and tail runs");

runCommand
  .command("start <taskId>")
  .requiredOption("--agent <agentId>")
  .action((taskId, options) => {
    const data = startRunCommand(runService, { taskId, agentId: options.agentId });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.runId
    );
  });

runCommand.command("status <runId>").action((runId) => {
  const data = runStatusCommand(runService, runId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: data ? "ok" : "error", data }, null, 2)
      : (data?.run.status ?? "Run not found")
  );
});

runCommand
  .command("cancel <runId>")
  .option("--reason <reason>")
  .action((runId, options) => {
    const data = cancelRunCommand(runService, runId, options.reason);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.status
    );
  });

runCommand.command("tail <runId>").action((runId) => {
  const data = tailRunCommand(runService, runId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : data
          .map((event) => `${event.type}: ${String(event.payloadSummary.message ?? "")}`)
          .join("\n")
  );
});

const planeCommand = program
  .command("plane")
  .description("Import, inspect, and preview external Plane work mirroring");

planeCommand
  .command("connect")
  .description("Show Plane adapter connection and privacy status")
  .action(async () => {
    const data = await externalPmHealth(externalPmService.adapterHealthPort());
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.state
    );
  });

planeCommand
  .command("doctor")
  .description("Report Plane adapter health")
  .action(async () => {
    const data = await externalPmHealth(externalPmService.adapterHealthPort());
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.nextAction
    );
  });

planeCommand
  .command("import")
  .requiredOption("--project <projectId>")
  .action(async (options) => {
    const data = await importPlaneCommand(externalPmService, { projectId: options.project });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} mirrors imported`
    );
  });

planeCommand
  .command("sync")
  .requiredOption("--project <projectId>")
  .action(async (options) => {
    const data = await syncPlaneCommand(externalPmService, { projectId: options.project });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} mirrors synced`
    );
  });

planeCommand
  .command("list")
  .option("--project <projectId>")
  .action((options) => {
    const data = listPlaneMirrorsCommand(externalPmService, options.project);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} mirrors`
    );
  });

planeCommand
  .command("link-task")
  .requiredOption("--mirror <mirrorId>")
  .requiredOption("--task <taskId>")
  .action((options) => {
    const data = linkPlaneTaskCommand(externalPmService, {
      mirrorId: options.mirror,
      taskId: options.task
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.taskId
    );
  });

planeCommand
  .command("writeback-preview")
  .requiredOption("--external-id <externalId>")
  .option("--mirror <mirrorId>")
  .option("--comment <comment>")
  .option("--status <status>")
  .action(async (options) => {
    const data = await previewPlaneWritebackCommand(externalPmService, {
      externalId: options.externalId,
      mirrorId: options.mirror,
      comment: options.comment,
      status: options.status,
      localOnly: Boolean(program.opts().localOnly)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.policyDecision.status
    );
  });

planeCommand
  .command("writeback")
  .requiredOption("--mirror <mirrorId>")
  .requiredOption("--decision <decision>")
  .option("--policy-decision <policyDecisionId>")
  .option("--comment <comment>")
  .option("--status <status>")
  .action(async (options) => {
    const data = await decidePlaneWritebackCommand(externalPmService, {
      mirrorId: options.mirror,
      decision: options.decision,
      policyDecisionId: options.policyDecision,
      comment: options.comment,
      status: options.status
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.syncStatus
    );
  });

planeCommand
  .command("disable")
  .option("--reason <reason>", "disable reason", "Operator disabled Plane adapter")
  .action(async (options) => {
    const data = await disablePlaneCommand(externalPmService, options.reason);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : "Plane mirroring disabled"
    );
  });

const policyCommand = program.command("policy").description("Check and approve policy decisions");

policyCommand
  .command("check")
  .requiredOption("--action <action>")
  .requiredOption("--subject-type <subjectType>")
  .requiredOption("--subject <subjectId>")
  .option("--requester <requester>")
  .option("--project <projectId>")
  .option("--task <taskId>")
  .option("--run <runId>")
  .option("--preview-ref <previewRef>")
  .action((options) => {
    const data = checkPolicyCommand(policyService, {
      action: options.action,
      subjectType: options.subjectType,
      subjectId: options.subject,
      requester: options.requester,
      projectId: options.project,
      taskId: options.task,
      runId: options.run,
      preview: true,
      localOnly: Boolean(program.opts().localOnly),
      previewRef: options.previewRef
    });
    const payload = { schemaVersion: SCHEMA_VERSION, status: "ok", data };
    console.log(
      program.opts().json
        ? JSON.stringify(payload, null, 2)
        : `${data.status}: ${data.reason} (${formatRedactionStatus(data.redactionStatus)})`
    );
    if (data.status === "approval_required") {
      process.exitCode = 2;
    } else if (data.status === "denied") {
      process.exitCode = 1;
    }
  });

policyCommand
  .command("approve <decisionId>")
  .option("--approved-by <approvedBy>")
  .action((decisionId, options) => {
    const data = approvePolicyCommand(policyService, decisionId, options.approvedBy);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : `${data.status}: ${data.policyDecisionId}`
    );
  });

program.parse();
