import path from "node:path";
import { Command } from "commander";
import {
  buildAdapterDegradationSummary,
  ArtifactService,
  externalPmHealth,
  LocalArtifactStorage,
  PolicyEnforcementService,
  QualityGateRunner,
  QualityReadinessEvaluator,
  BackupManifestService,
  FileBackupRepository,
  FileExportRepository,
  RebuildOrchestrator,
  RecoveryExportService,
  ResetUninstallPreviewService,
  RestoreValidationService,
  RunQualityLinker,
  resolveSetupPaths,
  type ArtifactRepositoryPort
} from "@fulcrum/core";
import {
  SCHEMA_VERSION,
  type ArtifactContract,
  type PolicyDecision,
  type RunEvent
} from "@fulcrum/shared";
import { runFulcrumMcpStdio } from "@fulcrum/mcp";
import {
  attachArtifactCommand,
  listRunArtifactsCommand,
  showArtifactCommand
} from "./commands/artifact.js";
import { doctorCommand } from "./commands/doctor.js";
import { codeCleanupStaleCommand, codeSearchCommand } from "./commands/code.js";
import {
  buildContextCommand,
  explainContextCommand,
  exportContextCommand,
  showContextCommand,
  writeContextExport
} from "./commands/context.js";
import { approveMemoryCommand, draftMemoryCommand } from "./commands/memory.js";
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
import {
  defineGateCommand,
  gateReadinessCommand,
  listGateResultsCommand,
  listGatesCommand,
  runGateCommand
} from "./commands/gate.js";
import {
  allocateWorktreeCommand,
  worktreeCleanupCommand,
  worktreeCleanupPreviewCommand,
  worktreeDiffCommand,
  worktreeStatusCommand
} from "./commands/worktree.js";
import {
  adapterDegradationCommand,
  disableAdapterCommand,
  enableAdapterCommand,
  listAdaptersCommand
} from "./commands/adapter.js";
import { rebuildGraphCommand, traceGraphCommand } from "./commands/graph.js";
import {
  createBackupCommand,
  exportRecoveryCommand,
  listBackupsCommand,
  rebuildCommand,
  resetPreviewCommand,
  restoreBackupCommand,
  uninstallPreviewCommand
} from "./commands/recovery.js";
import { listMcpToolsCommand } from "./commands/mcp.js";
import { formatRedactionStatus } from "./output/redaction.js";
import { createCliSetupPorts } from "./runtime.js";
import {
  codeService,
  contextBuilder,
  adapterRegistry,
  externalPmService,
  memoryService,
  projectService,
  qualityGateRepository,
  runRepository,
  runService,
  taskService,
  worktreeAllocationService,
  worktreeStatusService,
  graphService,
  graphLinkWriters,
  traceabilityService,
  graphRebuildSources
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
      extraCapabilities: [
        await externalPmHealth(externalPmService.adapterHealthPort()),
        ...(await buildAdapterDegradationSummary(adapterRegistry)).capabilities
      ]
    });
    console.log(program.opts().json ? JSON.stringify(payload, null, 2) : "Fulcrum doctor ready");
  });

const artifactService = new ArtifactService(
  new MemoryArtifactRepository(),
  new LocalArtifactStorage(resolveSetupPaths().artifactRoot),
  graphLinkWriters
);
const qualityRunner = new QualityGateRunner(
  qualityGateRepository,
  artifactService,
  runService,
  new RunQualityLinker(runRepository, qualityGateRepository),
  graphLinkWriters
);
const qualityReadiness = new QualityReadinessEvaluator(qualityGateRepository);
const policyService = new PolicyEnforcementService(
  new MemoryPolicyDecisionRepository(),
  new MemoryPolicyEventRepository(),
  graphLinkWriters
);
const paths = resolveSetupPaths();
const recoveryStoreFile = path.join(paths.stateRoot, "recovery-manifests.json");
const backupRepository = new FileBackupRepository(recoveryStoreFile);
const exportRepository = new FileExportRepository(recoveryStoreFile);
const recoveryDeps = {
  backups: new BackupManifestService(backupRepository),
  restore: new RestoreValidationService(backupRepository),
  exports: new RecoveryExportService(exportRepository),
  rebuild: new RebuildOrchestrator(),
  previews: new ResetUninstallPreviewService(policyService)
};
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

const gateCommand = program.command("gate").description("Define, run, and inspect quality gates");
const gateDeps = { runner: qualityRunner, readiness: qualityReadiness };

gateCommand
  .command("define")
  .requiredOption("--project <projectId>")
  .requiredOption("--name <name>")
  .requiredOption("--command <command>")
  .option("--required")
  .option("--timeout-ms <timeoutMs>")
  .action((options) => {
    const data = defineGateCommand(gateDeps, {
      projectId: options.project,
      name: options.name,
      command: options.command,
      required: Boolean(options.required),
      timeoutMs: options.timeoutMs ? Number(options.timeoutMs) : undefined
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.gateId
    );
  });

gateCommand
  .command("list")
  .requiredOption("--project <projectId>")
  .action((options) => {
    const data = listGatesCommand(gateDeps, options.project);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} gates`
    );
  });

gateCommand
  .command("run <gateId>")
  .requiredOption("--cwd <path>")
  .option("--project <projectId>")
  .option("--task <taskId>")
  .option("--run <runId>")
  .option("--skip")
  .action(async (gateId, options) => {
    const data = await runGateCommand(gateDeps, {
      gateId,
      cwd: options.cwd,
      projectId: options.project,
      taskId: options.task,
      runId: options.run,
      skip: Boolean(options.skip)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.status
    );
  });

gateCommand
  .command("results")
  .requiredOption("--project <projectId>")
  .option("--task <taskId>")
  .option("--run <runId>")
  .action((options) => {
    const data = listGateResultsCommand(gateDeps, {
      projectId: options.project,
      taskId: options.task,
      runId: options.run
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} gate results`
    );
  });

gateCommand
  .command("readiness")
  .requiredOption("--project <projectId>")
  .option("--task <taskId>")
  .option("--run <runId>")
  .action((options) => {
    const data = gateReadinessCommand(gateDeps, {
      projectId: options.project,
      taskId: options.task,
      runId: options.run
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.status
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

const runCommand = program.command("run").description("Start, inspect, cancel, and tail runs");

runCommand
  .command("start <taskId>")
  .requiredOption("--agent <agentId>")
  .option("--no-worktree")
  .action((taskId, options) => {
    const data = startRunCommand(runService, {
      taskId,
      agentId: options.agentId,
      allocateWorktree: options.worktree
    });
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

const worktreeCommand = program
  .command("worktree")
  .description("Allocate, inspect, and clean worktrees");

worktreeCommand
  .command("allocate <taskId>")
  .option("--branch <branch>")
  .option("--path <path>")
  .action((taskId, options) => {
    const data = allocateWorktreeCommand(worktreeAllocationService, {
      taskId,
      branch: options.branch,
      path: options.path
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.worktreeId
    );
  });

worktreeCommand.command("status <worktreeId>").action((worktreeId) => {
  const data = worktreeStatusCommand(worktreeStatusService, worktreeId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : `${data.worktree.status}: ${data.worktree.cleanupEligibility}`
  );
});

worktreeCommand
  .command("cleanup <worktreeId>")
  .option("--preview")
  .option("--approved")
  .action((worktreeId, options) => {
    const data = options.preview
      ? worktreeCleanupPreviewCommand(worktreeStatusService, worktreeId)
      : worktreeCleanupCommand(worktreeStatusService, worktreeId, Boolean(options.approved));
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : "worktree cleanup evaluated"
    );
  });

worktreeCommand.command("diff <worktreeId>").action((worktreeId) => {
  const data = worktreeDiffCommand(worktreeStatusService, worktreeId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
      : data.summary
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

const memoryCommand = program
  .command("memory")
  .description("Import, search, approve, stale, and export local memory");

memoryCommand
  .command("import <path>")
  .requiredOption("--project <projectId>")
  .option("--backend <backend>")
  .action(async (memoryPath, options) => {
    const data = await memoryService.import({
      projectId: options.project,
      path: memoryPath,
      backend: options.backend
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} memory entries imported`
    );
  });

memoryCommand
  .command("search <query>")
  .requiredOption("--project <projectId>")
  .option("--backend <backend>")
  .option("--limit <limit>")
  .action(async (query, options) => {
    const data = await memoryService.search({
      projectId: options.project,
      query,
      backend: options.backend,
      limit: options.limit ? Number(options.limit) : undefined
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : `${data.length} memory results`
    );
  });

memoryCommand
  .command("add")
  .requiredOption("--project <projectId>")
  .requiredOption("--title <title>")
  .requiredOption("--body <body>")
  .option("--source <sourceUri>")
  .option("--task <taskId>")
  .option("--run <runId>")
  .action((options) => {
    const data = draftMemoryCommand(memoryService, {
      projectId: options.project,
      title: options.title,
      body: options.body,
      sourceUri: options.source,
      taskId: options.task,
      runId: options.run
    });
    console.log(
      program.opts().json
        ? JSON.stringify(
            {
              schemaVersion: "1.0",
              status: "ok",
              data,
              policyDecisionIds: [data.policyDecision.policyDecisionId]
            },
            null,
            2
          )
        : data.policyDecision.status
    );
  });

memoryCommand
  .command("approve <memoryId>")
  .requiredOption("--policy-decision <policyDecisionId>")
  .action((memoryId, options) => {
    const data = approveMemoryCommand(memoryService, memoryId, {
      policyDecisionId: options.policyDecision
    });
    console.log(
      program.opts().json
        ? JSON.stringify(
            { schemaVersion: "1.0", status: data.entry ? "ok" : "error", data },
            null,
            2
          )
        : data.policyDecision.status
    );
  });

memoryCommand
  .command("stale <memoryId>")
  .option("--reason <reason>")
  .action((memoryId, options) => {
    const data = memoryService.markStale(memoryId, options.reason);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: "1.0", status: "ok", data }, null, 2)
        : data.status
    );
  });

memoryCommand
  .command("export")
  .requiredOption("--project <projectId>")
  .action((options) => {
    const data = memoryService.export(options.project);
    console.log(
      program.opts().json
        ? JSON.stringify(
            { schemaVersion: "1.0", status: "ok", data, redactionStatus: data.redactionStatus },
            null,
            2
          )
        : `${data.entries.length} memory entries exported`
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

const contextCommand = program
  .command("context")
  .description("Build, show, explain, and export context packs");

contextCommand
  .command("build <taskId>")
  .option("--budget <budget>")
  .option("--lane <lane...>")
  .option("--offline")
  .option("--memory-degraded")
  .option("--code-degraded")
  .option("--format <format>")
  .option("--output <path>")
  .action((taskId, options) => {
    const data = buildContextCommand(contextBuilder, {
      taskId,
      budget: options.budget ? Number(options.budget) : undefined,
      lanes: options.lane,
      offline: Boolean(options.offline),
      memoryAvailable: options.memoryDegraded ? false : undefined,
      codeAvailable: options.codeDegraded ? false : undefined
    });
    const format = options.format as "markdown" | "json" | "prompt" | "mcp" | undefined;
    if (format && !program.opts().json) {
      const content = exportContextCommand(contextBuilder, data.pack.contextPackId, format) ?? "";
      const written = options.output ? writeContextExport(options.output, content) : undefined;
      console.log(written ? `${written.outputPath} (${written.bytes} bytes)` : content);
      return;
    }
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.pack.contextPackId
    );
  });

contextCommand.command("show <contextPackId>").action((contextPackId) => {
  const data = showContextCommand(contextBuilder, contextPackId);
  console.log(
    program.opts().json
      ? JSON.stringify(
          { schemaVersion: SCHEMA_VERSION, status: data ? "ok" : "error", data },
          null,
          2
        )
      : (data?.pack.contextPackId ?? "Context pack not found")
  );
});

contextCommand.command("explain <contextPackId>").action((contextPackId) => {
  const data = explainContextCommand(contextBuilder, contextPackId);
  console.log(
    program.opts().json
      ? JSON.stringify(
          { schemaVersion: SCHEMA_VERSION, status: data ? "ok" : "error", data },
          null,
          2
        )
      : `${data?.items.length ?? 0} context items explained`
  );
});

contextCommand
  .command("export <contextPackId>")
  .option("--format <format>", "markdown, json, prompt, or mcp", "markdown")
  .option("--output <path>")
  .action((contextPackId, options) => {
    const data = exportContextCommand(contextBuilder, contextPackId, options.format);
    const written = data && options.output ? writeContextExport(options.output, data) : undefined;
    console.log(
      program.opts().json
        ? JSON.stringify(
            {
              schemaVersion: SCHEMA_VERSION,
              status: data ? "ok" : "error",
              data: written ?? data
            },
            null,
            2
          )
        : written
          ? `${written.outputPath} (${written.bytes} bytes)`
          : (data ?? "Context pack not found")
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

const adapterCommand = program
  .command("adapter")
  .description("Inspect optional adapters and degraded capabilities");

adapterCommand.command("list").action(async () => {
  const data = await listAdaptersCommand(adapterRegistry);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
      : `${data.length} adapters`
  );
});

adapterCommand.command("health").action(async () => {
  const data = await adapterDegradationCommand(adapterRegistry);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
      : `${data.degraded.length} degraded, ${data.disabled.length} disabled`
  );
});

adapterCommand.command("enable <adapterId>").action(async (adapterId) => {
  const data = await enableAdapterCommand(adapterRegistry, adapterId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
      : `${data.adapterId} enabled`
  );
});

adapterCommand
  .command("disable <adapterId>")
  .option("--reason <reason>", "disable reason", "Operator disabled adapter")
  .action(async (adapterId, options) => {
    const data = await disableAdapterCommand(adapterRegistry, adapterId, options.reason);
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : `${data.adapterId} disabled`
    );
  });

const backupCommand = program.command("backup").description("Create, list, and restore backups");

backupCommand
  .command("create")
  .option("--state-root <path>", "state root", paths.stateRoot)
  .option("--output-root <path>", "backup root", paths.backupRoot)
  .option("--no-context-packs")
  .action((options) => {
    const data = createBackupCommand(recoveryDeps, {
      stateRoot: options.stateRoot,
      outputRoot: options.outputRoot,
      includeContextPacks: options.contextPacks
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.backupId
    );
  });

backupCommand.command("list").action(() => {
  const data = listBackupsCommand(recoveryDeps);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
      : `${data.length} backups`
  );
});

backupCommand
  .command("restore <backupId>")
  .requiredOption("--target <path>")
  .action((backupId, options) => {
    const data = restoreBackupCommand(recoveryDeps, { backupId, target: options.target });
    console.log(
      program.opts().json
        ? JSON.stringify(
            { schemaVersion: SCHEMA_VERSION, status: data.valid ? "ok" : "error", data },
            null,
            2
          )
        : data.nextAction
    );
  });

program
  .command("restore <backupId>")
  .requiredOption("--target <path>")
  .action((backupId, options) => {
    const data = restoreBackupCommand(recoveryDeps, { backupId, target: options.target });
    console.log(
      program.opts().json
        ? JSON.stringify(
            { schemaVersion: SCHEMA_VERSION, status: data.valid ? "ok" : "error", data },
            null,
            2
          )
        : data.nextAction
    );
  });

program
  .command("export")
  .option("--format <format>", "json or jsonl", "json")
  .option("--output-root <path>", "export root", paths.stateRoot)
  .option("--entity <entity...>", "entity classes to export")
  .option("--policy-decision <policyDecisionId>")
  .action((options) => {
    const data = exportRecoveryCommand(recoveryDeps, {
      outputRoot: options.outputRoot,
      format: options.format,
      stateRoot: paths.stateRoot,
      entityClasses: options.entity ?? [
        "projects",
        "tasks",
        "runs",
        "artifacts",
        "memory",
        "policies"
      ],
      policyDecisionId: options.policyDecision
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.localRef
    );
  });

const rebuildRoot = program.command("rebuild").description("Rebuild derived data");

for (const name of ["projections", "memory-index", "code-cache"]) {
  rebuildRoot.command(name).action(() => {
    const data = rebuildCommand(recoveryDeps, {
      projections: 1,
      memory_indexes: name === "memory-index" ? 1 : 0,
      code_refs: name === "code-cache" ? 1 : 0
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : `${data.steps.filter((step) => step.status === "rebuilt").length} rebuild steps`
    );
  });
}

const resetCommand = program.command("reset").description("Preview reset actions");

resetCommand
  .command("preview")
  .option("--state-root <path>", "state root", paths.stateRoot)
  .option("--purge-backups")
  .action((options) => {
    const data = resetPreviewCommand(recoveryDeps, {
      stateRoot: options.stateRoot,
      purgeBackups: Boolean(options.purgeBackups)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.policyDecision?.status
    );
    process.exitCode = data.policyDecision?.status === "approval_required" ? 2 : 0;
  });

const uninstallCommand = program.command("uninstall").description("Preview uninstall actions");

uninstallCommand
  .command("preview")
  .option("--state-root <path>", "state root", paths.stateRoot)
  .option("--purge-backups")
  .action((options) => {
    const data = uninstallPreviewCommand(recoveryDeps, {
      stateRoot: options.stateRoot,
      purgeBackups: Boolean(options.purgeBackups)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.policyDecision?.status
    );
    process.exitCode = data.policyDecision?.status === "approval_required" ? 2 : 0;
  });

const mcpCommand = program.command("mcp").description("Run or inspect Fulcrum MCP interface");

mcpCommand
  .command("stdio")
  .description("Run local MCP stdio server")
  .action(async () => {
    const ports = await createCliSetupPorts();
    await runFulcrumMcpStdio({
      doctor: async (input) =>
        doctorCommand({
          setupRepository: ports.setupRepository,
          setupState: await ports.latest(),
          noNetwork: Boolean(input?.noNetwork),
          extraCapabilities: [
            await externalPmHealth(externalPmService.adapterHealthPort()),
            ...(await buildAdapterDegradationSummary(adapterRegistry)).capabilities
          ]
        }),
      projects: projectService,
      tasks: taskService,
      runs: runService,
      context: contextBuilder,
      memory: memoryService,
      code: codeService,
      artifacts: artifactService,
      quality: qualityRunner,
      policy: policyService,
      worktrees: worktreeAllocationService,
      worktreeStatus: worktreeStatusService
    });
  });

mcpCommand
  .command("tools")
  .description("List MCP tool visibility and permissions")
  .action(async () => {
    const ports = await createCliSetupPorts();
    const data = listMcpToolsCommand({
      doctor: async (input) =>
        doctorCommand({
          setupRepository: ports.setupRepository,
          setupState: await ports.latest(),
          noNetwork: Boolean(input?.noNetwork)
        }),
      projects: projectService,
      tasks: taskService,
      runs: runService,
      context: contextBuilder,
      memory: memoryService,
      code: codeService,
      artifacts: artifactService,
      quality: qualityRunner,
      policy: policyService,
      worktrees: worktreeAllocationService,
      worktreeStatus: worktreeStatusService
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : data.map((tool) => `${tool.name}: ${tool.permission}`).join("\n")
    );
  });

const graphCommand = program
  .command("graph")
  .description("Trace graph links and rebuild projections");
const graphDeps = {
  graph: graphService,
  traceability: traceabilityService,
  rebuildSources: graphRebuildSources
};

graphCommand
  .command("trace <type> <id>")
  .option("--depth <depth>")
  .option("--include-stale")
  .action((type, id, options) => {
    const data = traceGraphCommand(graphDeps, {
      type,
      id,
      depth: options.depth ? Number(options.depth) : undefined,
      includeStale: Boolean(options.includeStale)
    });
    console.log(
      program.opts().json
        ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
        : `${data.links.length} links`
    );
  });

graphCommand.command("rebuild <projectId>").action((projectId) => {
  const data = rebuildGraphCommand(graphDeps, projectId);
  console.log(
    program.opts().json
      ? JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "ok", data }, null, 2)
      : `${data.length} graph links rebuilt`
  );
});

program.parse();
