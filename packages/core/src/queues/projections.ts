import type { Project, Task } from "@fulcrum/shared";

export interface QueueSummary {
  blockers: Task[];
  review: Task[];
  merge: Task[];
  activeRuns: Task[];
  degradedProjects: Project[];
}

export function buildQueueSummary(projects: Project[], tasks: Task[]): QueueSummary {
  return {
    blockers: tasks.filter((task) => task.status === "blocked"),
    review: tasks.filter((task) => task.status === "review"),
    merge: tasks.filter((task) => task.labels.includes("merge")),
    activeRuns: tasks.filter((task) => task.status === "running" || Boolean(task.currentRunId)),
    degradedProjects: projects.filter((project) => project.healthState === "degraded")
  };
}
