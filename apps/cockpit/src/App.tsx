import { OverviewRoute } from "./routes/overview.js";
import { PolicyApprovalsRoute } from "./routes/policy-approvals.js";
import { ProjectBoardRoute } from "./routes/project-board.js";

export function App() {
  const hash = globalThis.location?.hash ?? "";
  if (hash.startsWith("#/policy")) {
    return <PolicyApprovalsRoute />;
  }
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}
