import { OverviewRoute } from "./routes/overview.js";
import { ProjectBoardRoute } from "./routes/project-board.js";

export function App() {
  const hash = globalThis.location?.hash ?? "";
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}
