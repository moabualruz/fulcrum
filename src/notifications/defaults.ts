import type { EntityManager } from "@mikro-orm/postgresql";

const DEFAULT_CHANNELS = ["in-app"] as const;
const DEFAULT_CHANNELS_SQL = "{in-app}";

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
  // Defensive: skip if notifications migration has not yet expanded notification_rules.
  // SeedService runs in test setups before all migrations have been applied.
  const cols = await em.getConnection().execute<Array<{ column_name: string }>>(
    `select column_name from information_schema.columns where table_name = 'notification_rules' and column_name = 'user_id'`,
  );
  if (!cols.length) return;

  const now = new Date();

  for (const rule of DEFAULT_NOTIFICATION_RULES) {
    await em.getConnection().execute(
      `
        insert into "notification_rules" (
          "id",
          "org_id",
          "user_id",
          "subject_kind",
          "active",
          "name",
          "event_pattern",
          "channels",
          "enabled",
          "created_at",
          "updated_at"
        ) values (?, ?, ?, ?, true, ?, ?::jsonb, ?::text[], true, ?, ?)
        on conflict ("user_id", "name") do nothing
      `,
      [
        crypto.randomUUID(),
        orgId,
        userId,
        rule.subjectKind,
        rule.name,
        JSON.stringify(rule.eventPattern),
        DEFAULT_CHANNELS_SQL,
        now,
        now,
      ],
    );
  }
}
