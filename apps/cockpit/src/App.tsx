import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
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

const optionalRouteModules = import.meta.glob("./routes/*.tsx");

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
    return <OptionalReadinessRoute title="Compliance" modulePath="./routes/compliance.tsx" />;
  }
  if (hash.startsWith("#/release")) {
    return <OptionalReadinessRoute title="Release Evidence" modulePath="./routes/release.tsx" />;
  }
  return hash.startsWith("#/projects/") ? <ProjectBoardRoute /> : <OverviewRoute />;
}

function OptionalReadinessRoute({
  title,
  modulePath
}: {
  title: string;
  modulePath: "./routes/compliance.tsx" | "./routes/release.tsx";
}) {
  const loader = optionalRouteModules[modulePath];
  if (!loader) {
    return (
      <main>
        <h1>{title}</h1>
        <p>{title} route not available in this build.</p>
      </main>
    );
  }
  const Route = lazy(async () => {
    const module = (await loader()) as Record<string, ComponentType>;
    return {
      default:
        module[`${title.replace(/\s/g, "")}Route`] ??
        module.default ??
        (() => (
          <main>
            <h1>{title}</h1>
            <p>{title} route did not export a component.</p>
          </main>
        ))
    };
  });
  return (
    <Suspense fallback={<main>Loading {title}</main>}>
      <Route />
    </Suspense>
  );
}
