import { useEffect, useState } from "react";

interface ProjectOverview {
  project: {
    projectId: string;
    name: string;
    healthState: string;
    privacyMode: string;
  };
  counts: {
    tasks: number;
    runs: number;
    blockers: number;
    review: number;
    merge: number;
  };
  degraded: string[];
}

export function OverviewRoute() {
  const [projects, setProjects] = useState<ProjectOverview[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/projects")
      .then((response) => response.json())
      .then((payload: { data?: ProjectOverview[] }) => {
        if (!active) {
          return;
        }
        setProjects(payload.data ?? []);
        setStatus("ready");
      })
      .catch(() => {
        if (active) {
          setStatus("degraded");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <header>
        <h1>Fulcrum Cockpit</h1>
        <p>{status === "degraded" ? "Project API degraded" : "Local work overview"}</p>
      </header>
      <section aria-label="Project queues">
        <h2>Projects</h2>
        <div role="list">
          {projects.map((item) => (
            <article role="listitem" tabIndex={0} key={item.project.projectId}>
              <h3>{item.project.name}</h3>
              <dl>
                <dt>Status</dt>
                <dd>{item.project.healthState}</dd>
                <dt>Privacy</dt>
                <dd>{item.project.privacyMode}</dd>
                <dt>Tasks</dt>
                <dd>{item.counts.tasks}</dd>
                <dt>Runs</dt>
                <dd>{item.counts.runs}</dd>
                <dt>Blockers</dt>
                <dd>{item.counts.blockers}</dd>
                <dt>Review</dt>
                <dd>{item.counts.review}</dd>
                <dt>Merge</dt>
                <dd>{item.counts.merge}</dd>
              </dl>
              {item.degraded.length > 0 ? <p>Degraded: {item.degraded.join(", ")}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
