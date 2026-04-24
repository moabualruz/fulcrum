import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  ArtifactService,
  externalPmHealth,
  LocalArtifactStorage,
  resolveSetupPaths
} from "@fulcrum/core";
import { MemoryArtifactRepository } from "./artifact-runtime.js";
import { registerDoctorRoutes } from "./routes/doctor.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerQueueRoutes } from "./routes/queues.js";
import { registerExternalPmRoutes } from "./routes/external-pm.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { createServerSetupPorts, FileSetupRepository } from "./runtime.js";
import {
  serverExternalPmService,
  serverProjectService,
  serverTaskService
} from "./work-runtime.js";

const app = new Hono();

const setupRepository = new FileSetupRepository();
const paths = resolveSetupPaths();

registerSetupRoutes(app, createServerSetupPorts(setupRepository));
registerDoctorRoutes(app, setupRepository, async () => [
  await externalPmHealth(serverExternalPmService.adapterHealthPort())
]);
registerProjectRoutes(app, serverProjectService);
registerTaskRoutes(app, serverTaskService);
registerQueueRoutes(app, serverProjectService, serverTaskService);
registerExternalPmRoutes(app, serverExternalPmService);
registerArtifactRoutes(
  app,
  new ArtifactService(new MemoryArtifactRepository(), new LocalArtifactStorage(paths.artifactRoot))
);

const port = Number(process.env.FULCRUM_PORT ?? 4173);

serve({ fetch: app.fetch, hostname: "127.0.0.1", port });

console.log(`Fulcrum local API listening on http://127.0.0.1:${port}`);
