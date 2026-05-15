import { Command, Option } from "commander";
import { createNotificationApiCallerFromEnv } from "@notification-center/interface/http/notification-api-client.ts";

const NOTIFICATION_CHANNELS = ["in-app", "email", "slack", "discord", "webhook", "push"] as const;
const DELIVERY_MODES = ["immediate", "digest", "delayed"] as const;

export function createNotifyCommand(): Command {
  const command = new Command("notify");
  command.description("Generated notify commands.");

  const channelsCommand = command.command("channels");
  channelsCommand.description("Generated notification channel commands.");

  const channelsConfigCommand = channelsCommand.command("config");
  channelsConfigCommand.description("notify channels config");
  channelsConfigCommand.option("--json", "Emit JSON output");
  channelsConfigCommand.addOption(new Option("--channel <choice>", "channel").choices([...NOTIFICATION_CHANNELS]));
  channelsConfigCommand.option("--email <string>", "email");
  channelsConfigCommand.option("--enabled", "enabled");
  channelsConfigCommand.option("--secret <string>", "secret");
  channelsConfigCommand.option("--subscription <string>", "subscription");
  channelsConfigCommand.option("--token <string>", "token");
  channelsConfigCommand.option("--url <string>", "url");
  channelsConfigCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().channels.config(compact({
        channel: requiredOption(options, "channel"),
        email: options.email,
        enabled: options.enabled === true ? true : undefined,
        secret: options.secret,
        subscription: options.subscription,
        token: options.token,
        url: options.url,
      }))
    );
  });

  const channelsListCommand = channelsCommand.command("list");
  channelsListCommand.description("notify channels list");
  channelsListCommand.option("--json", "Emit JSON output");
  channelsListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().channels.list()
    );
  });

  const channelsTestCommand = channelsCommand.command("test");
  channelsTestCommand.description("notify channels test");
  channelsTestCommand.option("--json", "Emit JSON output");
  channelsTestCommand.addOption(new Option("--channel <choice>", "channel").choices([...NOTIFICATION_CHANNELS]));
  channelsTestCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().channels.test({ channel: requiredOption(options, "channel") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("notify list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "Maximum notifications to return.", Number.parseFloat);
  listCommand.option("--offset <number>", "Pagination offset.", Number.parseFloat);
  listCommand.option("--unread", "Filter to unread notifications.");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().list(compact({
        limit: numberOption(options, "limit"),
        offset: numberOption(options, "offset"),
        unread: options.unread === true ? true : undefined,
      }))
    );
  });

  const markAllReadCommand = command.command("mark-all-read");
  markAllReadCommand.description("notify markAllRead");
  markAllReadCommand.option("--json", "Emit JSON output");
  markAllReadCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().markAllRead()
    );
  });

  const markReadCommand = command.command("mark-read");
  markReadCommand.description("notify markRead");
  markReadCommand.option("--json", "Emit JSON output");
  markReadCommand.option("--id <string>", "Notification identifier.");
  markReadCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().markRead({ id: requiredOption(options, "id") })
    );
  });

  const muteCommand = command.command("mute");
  muteCommand.description("notify mute");
  muteCommand.option("--json", "Emit JSON output");
  muteCommand.option("--muted-until <string>", "Mute expiration timestamp.");
  muteCommand.option("--subject-id <string>", "Notification subject identifier.");
  muteCommand.option("--subject-kind <string>", "Notification subject type.");
  muteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().mute({
        subjectKind: requiredOption(options, "subjectKind"),
        subjectId: requiredOption(options, "subjectId"),
        mutedUntil: options.mutedUntil,
      })
    );
  });

  const mutesCommand = command.command("mutes");
  mutesCommand.description("Generated notification mute commands.");

  const mutesListCommand = mutesCommand.command("list");
  mutesListCommand.description("notify mutes list");
  mutesListCommand.option("--json", "Emit JSON output");
  mutesListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().mutes.list()
    );
  });

  const quietHoursCommand = command.command("quiet-hours");
  quietHoursCommand.description("Generated quiet-hours commands.");

  const quietHoursGetCommand = quietHoursCommand.command("get");
  quietHoursGetCommand.description("notify quietHours get");
  quietHoursGetCommand.option("--json", "Emit JSON output");
  quietHoursGetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().quietHours.get()
    );
  });

  const quietHoursSetCommand = quietHoursCommand.command("set");
  quietHoursSetCommand.description("notify quietHours set");
  quietHoursSetCommand.option("--json", "Emit JSON output");
  quietHoursSetCommand.option("--days-of-week <csv>", "Comma-separated day indexes.");
  quietHoursSetCommand.option("--end-hour <number>", "Quiet-hours end hour.", Number.parseFloat);
  quietHoursSetCommand.option("--start-hour <number>", "Quiet-hours start hour.", Number.parseFloat);
  quietHoursSetCommand.option("--tz <string>", "IANA time zone.");
  quietHoursSetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().quietHours.set({
        tz: requiredOption(options, "tz"),
        startHour: requiredNumberOption(options, "startHour"),
        endHour: requiredNumberOption(options, "endHour"),
        daysOfWeek: daysOfWeekOption(options),
      })
    );
  });

  const rulesCommand = command.command("rules");
  rulesCommand.description("Generated notification rule commands.");

  const rulesCreateCommand = rulesCommand.command("create");
  rulesCreateCommand.description("notify rules create");
  rulesCreateCommand.option("--json", "Emit JSON output");
  addRuleOptions(rulesCreateCommand);
  rulesCreateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().rules.create({
        name: requiredOption(options, "name"),
        ...ruleBody(options),
      })
    );
  });

  const rulesDeleteCommand = rulesCommand.command("delete");
  rulesDeleteCommand.description("notify rules delete");
  rulesDeleteCommand.option("--json", "Emit JSON output");
  rulesDeleteCommand.option("--id <string>", "Notification identifier.");
  rulesDeleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().rules.delete({ id: requiredOption(options, "id") })
    );
  });

  const rulesGetCommand = rulesCommand.command("get");
  rulesGetCommand.description("notify rules get");
  rulesGetCommand.option("--json", "Emit JSON output");
  rulesGetCommand.option("--id <string>", "Notification identifier.");
  rulesGetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().rules.get({ id: requiredOption(options, "id") })
    );
  });

  const rulesListCommand = rulesCommand.command("list");
  rulesListCommand.description("notify rules list");
  rulesListCommand.option("--json", "Emit JSON output");
  rulesListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().rules.list()
    );
  });

  const rulesUpdateCommand = rulesCommand.command("update");
  rulesUpdateCommand.description("notify rules update");
  rulesUpdateCommand.option("--json", "Emit JSON output");
  rulesUpdateCommand.option("--id <string>", "Notification rule identifier.");
  addRuleOptions(rulesUpdateCommand);
  rulesUpdateCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().rules.update({
        id: requiredOption(options, "id"),
        ...ruleBody(options),
      })
    );
  });

  const unmuteCommand = command.command("unmute");
  unmuteCommand.description("notify unmute");
  unmuteCommand.option("--json", "Emit JSON output");
  unmuteCommand.option("--subject-id <string>", "Notification subject identifier.");
  unmuteCommand.option("--subject-kind <string>", "Notification subject type.");
  unmuteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().unmute({
        subjectKind: requiredOption(options, "subjectKind"),
        subjectId: requiredOption(options, "subjectId"),
      })
    );
  });

  const unreadCountCommand = command.command("unread-count");
  unreadCountCommand.description("notify unreadCount");
  unreadCountCommand.option("--json", "Emit JSON output");
  unreadCountCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await notificationClient().unreadCount()
    );
  });

  return command;
}

function addRuleOptions(command: Command): void {
  command.option("--critical", "Whether the rule is critical.");
  command.option("--delay-seconds <number>", "Delayed delivery offset.", Number.parseFloat);
  command.addOption(new Option("--delivery-mode <choice>", "Delivery timing mode.").choices([...DELIVERY_MODES]));
  command.option("--digest-window-seconds <number>", "Digest aggregation window.", Number.parseFloat);
  command.option("--enabled", "Whether rule is active.");
  command.option("--name <string>", "Notification rule name.");
  command.option("--subject-kind <string>", "Optional subject type scope.");
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function notificationClient() {
  const caller = createNotificationApiCallerFromEnv();
  if (!caller) {
    throw new Error(
      "Notification API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.",
    );
  }
  return caller.notify;
}

function ruleBody(options: Record<string, unknown>): Record<string, unknown> {
  return compact({
    name: options.name,
    subjectKind: options.subjectKind,
    enabled: options.enabled === true ? true : undefined,
    deliveryMode: options.deliveryMode,
    digestWindowSeconds: numberOption(options, "digestWindowSeconds"),
    delaySeconds: numberOption(options, "delaySeconds"),
    critical: options.critical === true ? true : undefined,
  });
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) {
    console.log(JSON.stringify(result));
    return;
  }
  if (typeof result === "object") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function numberOption(options: Record<string, unknown>, key: string): number | undefined {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredNumberOption(options: Record<string, unknown>, key: string): number {
  const value = numberOption(options, key);
  if (value !== undefined) return value;
  throw new Error(`${key} is required.`);
}

function daysOfWeekOption(options: Record<string, unknown>): number[] {
  const value = options["daysOfWeek"];
  if (typeof value !== "string" || !value.trim()) return [0, 1, 2, 3, 4, 5, 6];
  return value.split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((part) => Number.isInteger(part) && part >= 0 && part <= 6);
}
