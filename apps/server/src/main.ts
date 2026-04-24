import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { ArtifactService, LocalArtifactStorage, resolveSetupPaths } from "@fulcrum/core";
import { MemoryArtifactRepository } from "./artifact-runtime.js";
import { registerDoctorRoutes } from "./routes/doctor.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { createServerSetupPorts, FileSetupRepository } from "./runtime.js";

const app = new Hono();

const setupRepository = new FileSetupRepository();
const paths = resolveSetupPaths();

registerSetupRoutes(app, createServerSetupPorts(setupRepository));
registerDoctorRoutes(app, setupRepository);
registerArtifactRoutes(
  app,
  new ArtifactService(new MemoryArtifactRepository(), new LocalArtifactStorage(paths.artifactRoot))
);

const port = Number(process.env.FULCRUM_PORT ?? 4173);

serve({ fetch: app.fetch, hostname: "127.0.0.1", port });

console.log(`Fulcrum local API listening on http://127.0.0.1:${port}`);
