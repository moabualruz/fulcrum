import { OverviewRoute } from "./routes/overview.js";
import { ContextPackRoute } from "./routes/context-pack.js";
import { MemoryRoute } from "./routes/memory.js";
import { PolicyApprovalsRoute } from "./routes/policy-approvals.js";
import { ProjectBoardRoute } from "./routes/project-board.js";
import { RunDetailRoute } from "./routes/run-detail.js";
import { WorktreeDetailRoute } from "./routes/worktree-detail.js";

export function App() {
  const hash = globalThis.location?.hash ?? "";
  if (hash.startsWith("#/policy")) {
    return <PolicyApprovalsRoute />;
  }
  if (hash.startsWith("#/context-packs/")) {
    return <ContextPackRoute />;
  }
  if (hash.startsWith("#/runs/")) {
    return <RunDetailRoute />;
  }
  if (hash.startsWith("#/worktrees/")) {
    return <WorktreeDetailRoute />;
  }
  if (hash.startsWith("#/memory")) {
    return <MemoryRoute />;
  }
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}
