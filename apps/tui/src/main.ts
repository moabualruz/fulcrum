import { createAllTuiViews, renderTuiView } from "./views/index.js";

const viewName = process.argv[2] as keyof ReturnType<typeof createAllTuiViews> | undefined;
const views = createAllTuiViews();
const selected = views[viewName ?? "dashboard"] ?? views.dashboard;

console.log(renderTuiView(selected));
