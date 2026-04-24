import path from "node:path";
import { FileWorkRepository, resolveSetupPaths } from "@fulcrum/core";
import { createAllTuiViews, renderTuiView } from "./views/index.js";

const viewName = process.argv[2] as keyof ReturnType<typeof createAllTuiViews> | undefined;
const setupPaths = resolveSetupPaths(process.env.FULCRUM_STATE_ROOT);
const work = new FileWorkRepository(path.join(setupPaths.stateRoot, "work-state.json"));
const views = createAllTuiViews(work.read());
const selected = views[viewName ?? "dashboard"] ?? views.dashboard;

console.log(renderTuiView(selected));
