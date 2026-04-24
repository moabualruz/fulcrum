import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  ArtifactService,
  buildAdapterDegradationSummary,
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
  resolveSetupPaths
} from "@fulcrum/core";
import { MemoryArtifactRepository } from "./artifact-runtime.js";
import { enforceServerBindPolicy } from "./bind-policy.js";
import { MemoryPolicyDecisionRepository, MemoryPolicyEventRepository } from "./policy-runtime.js";
import { registerDoctorRoutes } from "./routes/doctor.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerCodeRoutes } from "./routes/code.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerContextPackRoutes } from "./routes/context-packs.js";
import { registerPolicyRoutes } from "./routes/policy.js";
import { registerQueueRoutes } from "./routes/queues.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerWorktreeRoutes } from "./routes/worktrees.js";
import { registerExternalPmRoutes } from "./routes/external-pm.js";
import { registerQualityRoutes } from "./routes/quality.js";
import { registerAdapterRoutes } from "./routes/adapters.js";
import { registerGraphRoutes } from "./routes/graph.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerRecoveryRoutes } from "./routes/recovery.js";
import { registerMcpRoutes } from "./mcp.js";
import { createServerSetupPorts, FileSetupRepository } from "./runtime.js";
import {
  serverExternalPmService,
  serverAdapterRegistry,
  serverCodeService,
  serverContextBuilder,
  serverMemoryService,
  serverProjectService,
  serverQualityGateRepository,
  runRepository,
  serverRunService,
  serverTaskService,
  serverWorktreeAllocationService,
  serverWorktreeStatusService,
  serverGraphService,
  serverGraphLinkWriters,
  serverTraceabilityService,
  serverGraphRebuildSources
} from "./work-runtime.js";

const app = new Hono();

const setupRepository = new FileSetupRepository();
const paths = resolveSetupPaths();
const policyService = new PolicyEnforcementService(
  new MemoryPolicyDecisionRepository(),
  new MemoryPolicyEventRepository(),
  serverGraphLinkWriters
);
const artifactService = new ArtifactService(
  new MemoryArtifactRepository(),
  new LocalArtifactStorage(paths.artifactRoot),
  serverGraphLinkWriters
);
const qualityRunner = new QualityGateRunner(
  serverQualityGateRepository,
  artifactService,
  serverRunService,
  new RunQualityLinker(runRepository, serverQualityGateRepository),
  serverGraphLinkWriters
);
const qualityReadiness = new QualityReadinessEvaluator(serverQualityGateRepository);
const recoveryStoreFile = path.join(paths.stateRoot, "recovery-manifests.json");
const backupRepository = new FileBackupRepository(recoveryStoreFile);
const exportRepository = new FileExportRepository(recoveryStoreFile);
const recoveryDeps = {
  backups: new BackupManifestService(backupRepository),
  restore: new RestoreValidationService(backupRepository),
  exports: new RecoveryExportService(exportRepository),
  rebuild: new RebuildOrchestrator(),
  previews: new ResetUninstallPreviewService(policyService),
  stateRoot: paths.stateRoot
};

registerSetupRoutes(app, createServerSetupPorts(setupRepository));
registerDoctorRoutes(app, setupRepository, async () => [
  await externalPmHealth(serverExternalPmService.adapterHealthPort()),
  ...(await buildAdapterDegradationSummary(serverAdapterRegistry)).capabilities
]);
registerProjectRoutes(app, serverProjectService);
registerTaskRoutes(app, serverTaskService);
registerQueueRoutes(app, serverProjectService, serverTaskService);
registerRunRoutes(app, serverRunService);
registerWorktreeRoutes(app, serverWorktreeAllocationService, serverWorktreeStatusService);
registerActivityRoutes(app, serverRunService);
registerMemoryRoutes(app, serverMemoryService);
registerCodeRoutes(app, serverCodeService);
registerExternalPmRoutes(app, serverExternalPmService);
registerAdapterRoutes(app, serverAdapterRegistry);
registerContextPackRoutes(app, serverContextBuilder);
registerArtifactRoutes(app, artifactService);
registerQualityRoutes(app, qualityRunner, qualityReadiness);
registerPolicyRoutes(app, policyService);
registerGraphRoutes(app, serverGraphService, serverTraceabilityService, serverGraphRebuildSources);
registerRecoveryRoutes(app, recoveryDeps);
registerMcpRoutes(app, {
  doctor: async () => ({
    setupState: await setupRepository.latest(),
    extraCapabilities: [
      await externalPmHealth(serverExternalPmService.adapterHealthPort()),
      ...(await buildAdapterDegradationSummary(serverAdapterRegistry)).capabilities
    ]
  }),
  projects: serverProjectService,
  tasks: serverTaskService,
  runs: serverRunService,
  context: serverContextBuilder,
  memory: serverMemoryService,
  code: serverCodeService,
  artifacts: artifactService,
  quality: qualityRunner,
  policy: policyService,
  worktrees: serverWorktreeAllocationService,
  worktreeStatus: serverWorktreeStatusService
});

const port = Number(process.env.FULCRUM_PORT ?? 4173);
const hostname = process.env.FULCRUM_HOST ?? "127.0.0.1";
const bind = enforceServerBindPolicy({
  hostname,
  port,
  policy: policyService,
  approvedDecisionId: process.env.FULCRUM_PUBLIC_BIND_POLICY_DECISION
});

serve({ fetch: app.fetch, hostname: bind.hostname, port });

console.log(`Fulcrum local API listening on http://${bind.hostname}:${port}`);
