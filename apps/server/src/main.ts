import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  ArtifactService,
  externalPmHealth,
  LocalArtifactStorage,
  PolicyEnforcementService,
  resolveSetupPaths
} from "@fulcrum/core";
import { MemoryArtifactRepository } from "./artifact-runtime.js";
import { enforceServerBindPolicy } from "./bind-policy.js";
import { MemoryPolicyDecisionRepository, MemoryPolicyEventRepository } from "./policy-runtime.js";
import { registerDoctorRoutes } from "./routes/doctor.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerPolicyRoutes } from "./routes/policy.js";
import { registerCodeRoutes } from "./routes/code.js";
import { registerQueueRoutes } from "./routes/queues.js";
import { registerExternalPmRoutes } from "./routes/external-pm.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { createServerSetupPorts, FileSetupRepository } from "./runtime.js";
import {
  serverExternalPmService,
  serverCodeService,
  serverProjectService,
  serverTaskService
} from "./work-runtime.js";

const app = new Hono();

const setupRepository = new FileSetupRepository();
const paths = resolveSetupPaths();
const policyService = new PolicyEnforcementService(
  new MemoryPolicyDecisionRepository(),
  new MemoryPolicyEventRepository()
);

registerSetupRoutes(app, createServerSetupPorts(setupRepository));
registerDoctorRoutes(app, setupRepository, async () => [
  await externalPmHealth(serverExternalPmService.adapterHealthPort())
]);
registerProjectRoutes(app, serverProjectService);
registerTaskRoutes(app, serverTaskService);
registerQueueRoutes(app, serverProjectService, serverTaskService);
registerCodeRoutes(app, serverCodeService);
registerExternalPmRoutes(app, serverExternalPmService);
registerArtifactRoutes(
  app,
  new ArtifactService(new MemoryArtifactRepository(), new LocalArtifactStorage(paths.artifactRoot))
);
registerPolicyRoutes(app, policyService);

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
