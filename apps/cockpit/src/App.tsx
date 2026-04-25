import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import { OverviewRoute } from "./routes/overview.js";
import { ContextPackRoute } from "./routes/context-pack.js";
import { MemoryRoute } from "./routes/memory.js";
import { PolicyApprovalsRoute } from "./routes/policy-approvals.js";
import { ProjectBoardRoute } from "./routes/project-board.js";
import { ReviewQueueRoute } from "./routes/review-queue.js";
import { RunDetailRoute } from "./routes/run-detail.js";
import { WorktreeDetailRoute } from "./routes/worktree-detail.js";
import { AdaptersRoute } from "./routes/adapters.js";
import { RecoveryRoute } from "./routes/recovery.js";
import { TraceabilityRoute } from "./routes/traceability.js";

const ComplianceRoute = lazy(() =>
  import("./routes/compliance.js").then((module) => ({ default: module.ComplianceRoute }))
);
const ReleaseRoute = lazy(() =>
  import("./routes/release.js").then((module) => ({ default: module.ReleaseEvidenceRoute }))
);

export function App() {
  const hash = globalThis.location?.hash ?? "";
  if (hash.startsWith("#/policy")) {
    return <PolicyApprovalsRoute />;
  }
  if (hash.startsWith("#/review-queue") || hash.startsWith("#/merge-queue")) {
    return <ReviewQueueRoute />;
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
  if (hash.startsWith("#/adapters")) {
    return <AdaptersRoute />;
  }
  if (hash.startsWith("#/recovery")) {
    return <RecoveryRoute />;
  }
  if (hash.startsWith("#/traceability")) {
    return <TraceabilityRoute />;
  }
  if (hash.startsWith("#/compliance")) {
    return <LazyRoute title="Compliance" route={ComplianceRoute} />;
  }
  if (hash.startsWith("#/release")) {
    return <LazyRoute title="Release Evidence" route={ReleaseRoute} />;
  }
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}

function LazyRoute({
  title,
  route: Route
}: {
  title: string;
  route: LazyExoticComponent<ComponentType>;
}) {
  return (
    <Suspense fallback={<main>Loading {title}</main>}>
      <Route />
    </Suspense>
  );
}
