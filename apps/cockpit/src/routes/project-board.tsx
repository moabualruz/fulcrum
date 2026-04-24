import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ExternalMirrorPanel } from "../components/external-mirror.js";

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
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [transitionStatus, setTransitionStatus] = useState<string>("");

  function loadTasks() {
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
  }

  useEffect(() => {
    return loadTasks();
  }, [projectId]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !title.trim()) {
      setTransitionStatus("Project and title required");
      return;
    }
    const response = await fetch("/api/v1/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        title: title.trim(),
        priority,
        labels: ["cockpit"]
      })
    });
    if (!response.ok) {
      setTransitionStatus("Task creation failed");
      return;
    }
    const payload = (await response.json()) as { data?: TaskItem };
    if (payload.data) {
      setTasks((current) => [payload.data as TaskItem, ...current]);
    }
    setTitle("");
    setTransitionStatus("Task created");
  }

  async function transitionTask(taskId: string, nextStatus: string) {
    const response = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (!response.ok) {
      setTransitionStatus("Task transition failed");
      return;
    }
    setTasks((current) =>
      current.map((task) => (task.taskId === taskId ? { ...task, status: nextStatus } : task))
    );
    setTransitionStatus(`Task moved to ${nextStatus}`);
  }

  const blockers = tasks.filter((task) => task.status === "blocked");
  const ready = tasks.filter((task) => task.status === "ready" || task.status === "pending");
  const review = tasks.filter((task) => task.status === "review");
  const merge = tasks.filter((task) => task.labels.includes("merge"));

  return (
    <main>
      <h1>Project Board</h1>
      <p>{status === "degraded" ? "Task API degraded" : "Local task queues"}</p>
      <nav aria-label="Cockpit workflows">
        <a href="#/review-queue">Review queue</a> <a href="#/policy">Policy approvals</a>{" "}
        <a href="#/recovery">Recovery</a> <a href="#/compliance">Compliance</a>{" "}
        <a href="#/release">Release evidence</a>
      </nav>
      <section aria-label="Create task">
        <h2>Create Task</h2>
        <form onSubmit={(event) => void createTask(event)}>
          <label>
            Title
            <input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label>
            Priority
            <select
              name="priority"
              value={priority}
              onChange={(event) =>
                setPriority(event.currentTarget.value as "low" | "normal" | "high" | "urgent")
              }
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <button type="submit">Create task</button>
        </form>
        <p aria-live="polite">{transitionStatus}</p>
      </section>
      <section aria-label="Task queues">
        <h2>Queues</h2>
        <Queue name="Blocked" tasks={blockers} onTransition={transitionTask} />
        <Queue name="Ready" tasks={ready} onTransition={transitionTask} />
        <Queue name="Review" tasks={review} onTransition={transitionTask} />
        <Queue name="Merge" tasks={merge} onTransition={transitionTask} />
      </section>
      <section aria-label="Health states">
        <h2>Health</h2>
        <p>Managed: available</p>
        <p>Degraded: attention required</p>
      </section>
      <ExternalMirrorPanel projectId={projectId} />
    </main>
  );
}

function Queue({
  name,
  tasks,
  onTransition
}: {
  name: string;
  tasks: TaskItem[];
  onTransition: (taskId: string, nextStatus: string) => Promise<void>;
}) {
  return (
    <article tabIndex={0}>
      <h3>{name}</h3>
      <p>{tasks.length}</p>
      <ul>
        {tasks.map((task) => (
          <TaskQueueItem key={task.taskId} task={task} onTransition={onTransition} />
        ))}
      </ul>
    </article>
  );
}

function TaskQueueItem({
  task,
  onTransition
}: {
  task: TaskItem;
  onTransition: (taskId: string, nextStatus: string) => Promise<void>;
}) {
  const nextStatus = nextTaskStatus(task);

  return (
    <li>
      {task.title} <span aria-label={`${task.title} status`}>{task.status}</span>{" "}
      {nextStatus ? (
        <button type="button" onClick={() => void onTransition(task.taskId, nextStatus)}>
          Move to {nextStatus}
        </button>
      ) : null}
    </li>
  );
}

function nextTaskStatus(task: TaskItem): string | undefined {
  switch (task.status) {
    case "pending":
    case "blocked":
      return "ready";
    case "ready":
      return "running";
    case "review":
      return "completed";
    case "completed":
      return "archived";
    default:
      return undefined;
  }
}
