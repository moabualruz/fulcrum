import { seedDefaultNotificationRules } from "@notification-center/application/notifications/queries.ts";

const DEFAULT_CHANNELS = ["in-app"] as const;

export const DEFAULT_NOTIFICATION_RULES = [
  {
    name: "assignment-to-me",
    subjectKind: "task",
    eventPattern: {
      subject_kind: "task",
      verb: "assigned",
      payload_path_eq: [{ path: "assignee_id", value: "$current_user_id" }],
    },
  },
  {
    name: "mention-of-me",
    subjectKind: null,
    eventPattern: {
      verb: "mentioned",
      payload_path_eq: [{ path: "mentioned_user_id", value: "$current_user_id" }],
    },
  },
  {
    name: "sprint-changes-affecting-my-tasks",
    subjectKind: "sprint",
    eventPattern: {
      subject_kind: "sprint",
      verb: "changed",
      payload_path_eq: [{ path: "sprint_id", value: "$sprint_of_my_tasks" }],
    },
  },
  {
    name: "run-completed-on-my-task",
    subjectKind: "agent_run",
    eventPattern: {
      subject_kind: "agent_run",
      verb: "completed",
      payload_path_eq: [{ path: "task_id", value: "$tasks_assigned_to_current_user" }],
    },
  },
] as const;

export async function seedDefaultRules(
  userId: string,
  orgId: string,
  em: Parameters<typeof seedDefaultNotificationRules>[2],
): Promise<void> {
  await seedDefaultNotificationRules(userId, orgId, em, DEFAULT_NOTIFICATION_RULES, [...DEFAULT_CHANNELS]);
}
