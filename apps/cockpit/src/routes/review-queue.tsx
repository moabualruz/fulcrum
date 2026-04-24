import { useEffect, useState } from "react";

interface QueueTask {
  taskId: string;
  projectId: string;
  title: string;
  status: string;
  labels: string[];
}

interface QueueState {
  review: QueueTask[];
  merge: QueueTask[];
}

export function ReviewQueueRoute() {
  const [queue, setQueue] = useState<QueueState>({ review: [], merge: [] });
  const [status, setStatus] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/v1/queues/review").then((response) => response.json()),
      fetch("/api/v1/queues/merge").then((response) => response.json())
    ])
      .then(([reviewPayload, mergePayload]: [{ data?: QueueTask[] }, { data?: QueueTask[] }]) => {
        if (!active) {
          return;
        }
        setQueue({ review: reviewPayload.data ?? [], merge: mergePayload.data ?? [] });
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

  async function transition(taskId: string, nextStatus: string) {
    const response = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (response.ok) {
      setQueue((current) => ({
        review: current.review.map((task) =>
          task.taskId === taskId ? { ...task, status: nextStatus } : task
        ),
        merge: current.merge.map((task) =>
          task.taskId === taskId ? { ...task, status: nextStatus } : task
        )
      }));
    }
  }

  return (
    <main>
      <h1>Review Queue</h1>
      <p>{status === "degraded" ? "Review queue degraded" : "Review and merge readiness"}</p>
      <QueueColumn
        label="Review readiness"
        tasks={queue.review}
        nextAction="Mark merge ready"
        onAction={(taskId) => void transition(taskId, "completed")}
      />
      <QueueColumn
        label="Merge readiness"
        tasks={queue.merge}
        nextAction="Archive merged"
        onAction={(taskId) => void transition(taskId, "archived")}
      />
    </main>
  );
}

function QueueColumn({
  label,
  tasks,
  nextAction,
  onAction
}: {
  label: string;
  tasks: QueueTask[];
  nextAction: string;
  onAction: (taskId: string) => void;
}) {
  return (
    <section aria-label={label}>
      <h2>{label}</h2>
      {tasks.length === 0 ? <p>No tasks waiting</p> : null}
      <div role="list">
        {tasks.map((task) => (
          <article role="listitem" tabIndex={0} key={task.taskId}>
            <h3>{task.title}</h3>
            <p>Status: {task.status}</p>
            <p>Labels: {task.labels.length ? task.labels.join(", ") : "none"}</p>
            <button type="button" onClick={() => onAction(task.taskId)}>
              {nextAction}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
