import { useEffect, useMemo, useState } from "react";

interface TaskItem {
  taskId: string;
  projectId: string;
  title: string;
  status: string;
  labels: string[];
}

export function ProjectBoardRoute() {
  const projectId = useMemo(() => {
    const [, id] = (globalThis.location?.hash ?? "").match(/^#\/projects\/([^/]+)/) ?? [];
    return id;
  }, []);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    let active = true;
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    fetch(`/api/v1/tasks${query}`)
      .then((response) => response.json())
      .then((payload: { data?: TaskItem[] }) => {
        if (!active) {
          return;
        }
        setTasks(payload.data ?? []);
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
  }, [projectId]);

  const blockers = tasks.filter((task) => task.status === "blocked");
  const ready = tasks.filter((task) => task.status === "ready" || task.status === "pending");
  const review = tasks.filter((task) => task.status === "review");
  const merge = tasks.filter((task) => task.labels.includes("merge"));

  return (
    <main>
      <h1>Project Board</h1>
      <p>{status === "degraded" ? "Task API degraded" : "Local task queues"}</p>
      <section aria-label="Task queues">
        <h2>Queues</h2>
        <Queue name="Blocked" tasks={blockers} />
        <Queue name="Ready" tasks={ready} />
        <Queue name="Review" tasks={review} />
        <Queue name="Merge" tasks={merge} />
      </section>
      <section aria-label="Health states">
        <h2>Health</h2>
        <p>Managed: available</p>
        <p>Degraded: attention required</p>
      </section>
    </main>
  );
}

function Queue({ name, tasks }: { name: string; tasks: TaskItem[] }) {
  return (
    <article tabIndex={0}>
      <h3>{name}</h3>
      <p>{tasks.length}</p>
      <ul>
        {tasks.map((task) => (
          <li key={task.taskId}>{task.title}</li>
        ))}
      </ul>
    </article>
  );
}
