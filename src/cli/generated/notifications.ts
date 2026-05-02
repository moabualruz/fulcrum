import { Command, Option } from "commander";

export function createNotificationsCommand(): Command {
  const command = new Command("notifications");
  command.description("Generated notifications commands.");

  const channelsConfigCommand = command.command("channels config");
  channelsConfigCommand.description("notifications channels config");
  channelsConfigCommand.option("--json", "Emit JSON output");
  channelsConfigCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.channels.config is not wired yet.");
  });

  const channelsListCommand = command.command("channels list");
  channelsListCommand.description("notifications channels list");
  channelsListCommand.option("--json", "Emit JSON output");
  channelsListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.channels.list is not wired yet.");
  });

  const channelsTestCommand = command.command("channels test");
  channelsTestCommand.description("notifications channels test");
  channelsTestCommand.option("--json", "Emit JSON output");
  channelsTestCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.channels.test is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("notifications list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.list is not wired yet.");
  });

  const markReadCommand = command.command("mark-read");
  markReadCommand.description("notifications markRead");
  markReadCommand.option("--json", "Emit JSON output");
  markReadCommand.option("--id <string>", "id");
  markReadCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.markRead is not wired yet.");
  });

  const muteCommand = command.command("mute");
  muteCommand.description("notifications mute");
  muteCommand.option("--json", "Emit JSON output");
  muteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.mute is not wired yet.");
  });

  const quietHoursGetCommand = command.command("quiet-hours get");
  quietHoursGetCommand.description("notifications quietHours get");
  quietHoursGetCommand.option("--json", "Emit JSON output");
  quietHoursGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.quietHours.get is not wired yet.");
  });

  const quietHoursSetCommand = command.command("quiet-hours set");
  quietHoursSetCommand.description("notifications quietHours set");
  quietHoursSetCommand.option("--json", "Emit JSON output");
  quietHoursSetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.quietHours.set is not wired yet.");
  });

  const rulesCreateCommand = command.command("rules create");
  rulesCreateCommand.description("notifications rules create");
  rulesCreateCommand.option("--json", "Emit JSON output");
  rulesCreateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.rules.create is not wired yet.");
  });

  const rulesDeleteCommand = command.command("rules delete");
  rulesDeleteCommand.description("notifications rules delete");
  rulesDeleteCommand.option("--json", "Emit JSON output");
  rulesDeleteCommand.option("--id <string>", "id");
  rulesDeleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.rules.delete is not wired yet.");
  });

  const rulesGetCommand = command.command("rules get");
  rulesGetCommand.description("notifications rules get");
  rulesGetCommand.option("--json", "Emit JSON output");
  rulesGetCommand.option("--id <string>", "id");
  rulesGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.rules.get is not wired yet.");
  });

  const rulesListCommand = command.command("rules list");
  rulesListCommand.description("notifications rules list");
  rulesListCommand.option("--json", "Emit JSON output");
  rulesListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.rules.list is not wired yet.");
  });

  const rulesUpdateCommand = command.command("rules update");
  rulesUpdateCommand.description("notifications rules update");
  rulesUpdateCommand.option("--json", "Emit JSON output");
  rulesUpdateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.rules.update is not wired yet.");
  });

  const unmuteCommand = command.command("unmute");
  unmuteCommand.description("notifications unmute");
  unmuteCommand.option("--json", "Emit JSON output");
  unmuteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.unmute is not wired yet.");
  });

  const unreadCountCommand = command.command("unread-count");
  unreadCountCommand.description("notifications unreadCount");
  unreadCountCommand.option("--json", "Emit JSON output");
  unreadCountCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notifications.unreadCount is not wired yet.");
  });

  return command;
}
