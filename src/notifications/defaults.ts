import type { EntityManager } from "@mikro-orm/postgresql";
import { Org } from "../db/entities/auth/Org.ts";
import { NotificationRule } from "../db/entities/notifications/NotificationRule.ts";

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
  em: EntityManager,
): Promise<void> {
  const now = new Date();
  const org = em.getReference(Org, orgId);

  for (const rule of DEFAULT_NOTIFICATION_RULES) {
    let existing: NotificationRule | null;
    try {
      existing = await em.findOne(NotificationRule, {
        userId,
        name: rule.name,
      } as never);
    } catch (error) {
      if (isMissingNotificationRuleColumns(error)) return;
      throw error;
    }
    if (existing) continue;
    em.persist(em.create(NotificationRule, {
      org,
      userId,
      subjectKind: rule.subjectKind,
      active: true,
      name: rule.name,
      eventPattern: rule.eventPattern,
      channels: [...DEFAULT_CHANNELS],
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }));
  }
  await em.flush();
}

function isMissingNotificationRuleColumns(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { cause?: unknown; code?: unknown; message?: unknown };
  const message = String(candidate.message ?? "");
  if (
    (candidate.code === "42703" || message.includes("does not exist")) &&
    (message.includes("notification_rules") || message.includes("n0")) &&
    message.includes("user_id")
  ) {
    return true;
  }
  return isMissingNotificationRuleColumns(candidate.cause);
}
