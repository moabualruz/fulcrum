import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  ComplianceService,
  FileBackupRepository,
  FileExportRepository,
  RebuildOrchestrator,
  RecoveryExportService,
  ResetUninstallPreviewService,
  RestoreValidationService,
  RunQualityLinker,
  resolveSetupPaths
} from "@fulcrum/core";
import { SCHEMA_VERSION } from "@fulcrum/shared";
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
import { registerComplianceRoutes } from "./routes/compliance.js";
import { registerReleaseRoutes } from "./routes/release.js";
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
  serverGraphRebuildSources,
  serverInvalidationService,
  serverReadinessRepository
} from "./work-runtime.js";

const app = new Hono();
const complianceService = new ComplianceService(serverReadinessRepository);
const serverSourceDir = path.dirname(fileURLToPath(import.meta.url));
const cockpitAssetRoots = [
  process.env.FULCRUM_COCKPIT_DIST,
  path.resolve(process.cwd(), "apps/cockpit/dist"),
  path.resolve(serverSourceDir, "../../cockpit/dist")
].filter((candidate): candidate is string => Boolean(candidate));

function resolveCockpitAsset(requestPath: string): string | undefined {
  const normalized = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, "");
  const relativePath =
    normalized === "/" || normalized === "." ? "index.html" : normalized.replace(/^[/\\]/, "");
  for (const root of cockpitAssetRoots) {
    const candidate = path.resolve(root, relativePath);
    const rootWithSeparator = path.resolve(root) + path.sep;
    if (!candidate.startsWith(rootWithSeparator) && candidate !== path.resolve(root)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function cockpitContentType(assetPath: string): string {
  const extension = path.extname(assetPath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

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
registerGraphRoutes(
  app,
  serverGraphService,
  serverTraceabilityService,
  serverGraphRebuildSources,
  serverInvalidationService
);
registerRecoveryRoutes(app, recoveryDeps);
registerComplianceRoutes(app, complianceService);
registerReleaseRoutes(app, complianceService);
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

app.get("/", (context) => {
  const indexPath = resolveCockpitAsset("index.html");
  if (!indexPath) {
    return context.json(
      {
        status: "guided",
        nextAction: "Build cockpit assets with `pnpm --filter @fulcrum/cockpit build`."
      },
      404
    );
  }
  return new Response(readFileSync(indexPath), {
    headers: { "content-type": cockpitContentType(indexPath) }
  });
});

app.get("/*", (context, next) => {
  if (context.req.path.startsWith("/api/") || context.req.path.startsWith("/mcp")) return next();
  const assetPath = resolveCockpitAsset(context.req.path);
  const fallbackPath = resolveCockpitAsset("index.html");
  const servedPath = assetPath ?? fallbackPath;
  if (!servedPath) return next();
  return new Response(readFileSync(servedPath), {
    headers: { "content-type": cockpitContentType(servedPath) }
  });
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

const cockpitIndexPath = resolveCockpitAsset("index.html");
const url = `http://${bind.hostname}:${port}`;
const startupPayload = {
  schemaVersion: SCHEMA_VERSION,
  status: "ok",
  data: {
    url,
    stateRoot: paths.stateRoot,
    privacyStatus:
      bind.hostname === "127.0.0.1" || bind.hostname === "localhost" || bind.hostname === "::1"
        ? "local_only"
        : "operator_configured",
    cockpit: cockpitIndexPath
      ? {
          status: "managed",
          assetRoot: path.dirname(cockpitIndexPath)
        }
      : {
          status: "guided",
          nextAction: "Build cockpit assets with `pnpm --filter @fulcrum/cockpit build`."
        },
    shutdown: "Press Ctrl+C to stop the local server."
  }
};

if (process.env.FULCRUM_SERVER_OUTPUT === "json") {
  console.log(JSON.stringify(startupPayload, null, 2));
} else {
  const cockpitStatus = cockpitIndexPath
    ? `cockpit assets: ${path.dirname(cockpitIndexPath)}`
    : "cockpit assets missing; run pnpm --filter @fulcrum/cockpit build";
  console.log(
    `Fulcrum local API listening on ${url}\nstate root: ${paths.stateRoot}\nprivacy: ${startupPayload.data.privacyStatus}\n${cockpitStatus}\nshutdown: ${startupPayload.data.shutdown}`
  );
}
