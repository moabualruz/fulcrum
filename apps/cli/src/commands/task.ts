import type { LocalTaskService } from "@fulcrum/core";
import type { Task } from "@fulcrum/shared";

export function createTaskCommand(
  service: LocalTaskService,
  input: {
    projectId: string;
    title: string;
    description?: string;
    priority?: Task["priority"];
    labels?: string[];
  }
) {
  return service.create(input);
}

export function listTasksCommand(service: LocalTaskService, projectId?: string) {
  return service.list(projectId);
}

export function transitionTaskCommand(
  service: LocalTaskService,
  taskId: string,
  status: Task["status"]
) {
  return service.transition(taskId, status);
}
