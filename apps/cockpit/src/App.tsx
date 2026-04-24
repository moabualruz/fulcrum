import { OverviewRoute } from "./routes/overview.js";
import { PolicyApprovalsRoute } from "./routes/policy-approvals.js";
import { ProjectBoardRoute } from "./routes/project-board.js";
import { RunDetailRoute } from "./routes/run-detail.js";

export function App() {
  const hash = globalThis.location?.hash ?? "";
  if (hash.startsWith("#/policy")) {
    return <PolicyApprovalsRoute />;
  }
  if (hash.startsWith("#/runs/")) {
    return <RunDetailRoute />;
  }
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}
