import { Command, Option } from "commander";

export function createNotifyCommand(): Command {
  const command = new Command("notify");
  command.description("Generated notify commands.");

  const channelsConfigCommand = command.command("channels config");
  channelsConfigCommand.description("notify channels config");
  channelsConfigCommand.option("--json", "Emit JSON output");
  channelsConfigCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.channels.config is not wired yet.");
  });

  const channelsListCommand = command.command("channels list");
  channelsListCommand.description("notify channels list");
  channelsListCommand.option("--json", "Emit JSON output");
  channelsListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.channels.list is not wired yet.");
  });

  const channelsTestCommand = command.command("channels test");
  channelsTestCommand.description("notify channels test");
  channelsTestCommand.option("--json", "Emit JSON output");
  channelsTestCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.channels.test is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("notify list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.list is not wired yet.");
  });

  const markReadCommand = command.command("mark-read");
  markReadCommand.description("notify markRead");
  markReadCommand.option("--json", "Emit JSON output");
  markReadCommand.option("--id <string>", "id");
  markReadCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.markRead is not wired yet.");
  });

  const muteCommand = command.command("mute");
  muteCommand.description("notify mute");
  muteCommand.option("--json", "Emit JSON output");
  muteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.mute is not wired yet.");
  });

  const quietHoursGetCommand = command.command("quiet-hours get");
  quietHoursGetCommand.description("notify quietHours get");
  quietHoursGetCommand.option("--json", "Emit JSON output");
  quietHoursGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.quietHours.get is not wired yet.");
  });

  const quietHoursSetCommand = command.command("quiet-hours set");
  quietHoursSetCommand.description("notify quietHours set");
  quietHoursSetCommand.option("--json", "Emit JSON output");
  quietHoursSetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.quietHours.set is not wired yet.");
  });

  const rulesCreateCommand = command.command("rules create");
  rulesCreateCommand.description("notify rules create");
  rulesCreateCommand.option("--json", "Emit JSON output");
  rulesCreateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.rules.create is not wired yet.");
  });

  const rulesDeleteCommand = command.command("rules delete");
  rulesDeleteCommand.description("notify rules delete");
  rulesDeleteCommand.option("--json", "Emit JSON output");
  rulesDeleteCommand.option("--id <string>", "id");
  rulesDeleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.rules.delete is not wired yet.");
  });

  const rulesGetCommand = command.command("rules get");
  rulesGetCommand.description("notify rules get");
  rulesGetCommand.option("--json", "Emit JSON output");
  rulesGetCommand.option("--id <string>", "id");
  rulesGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.rules.get is not wired yet.");
  });

  const rulesListCommand = command.command("rules list");
  rulesListCommand.description("notify rules list");
  rulesListCommand.option("--json", "Emit JSON output");
  rulesListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.rules.list is not wired yet.");
  });

  const rulesUpdateCommand = command.command("rules update");
  rulesUpdateCommand.description("notify rules update");
  rulesUpdateCommand.option("--json", "Emit JSON output");
  rulesUpdateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.rules.update is not wired yet.");
  });

  const unmuteCommand = command.command("unmute");
  unmuteCommand.description("notify unmute");
  unmuteCommand.option("--json", "Emit JSON output");
  unmuteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.unmute is not wired yet.");
  });

  const unreadCountCommand = command.command("unread-count");
  unreadCountCommand.description("notify unreadCount");
  unreadCountCommand.option("--json", "Emit JSON output");
  unreadCountCommand.action(async () => {
    throw new Error("Generated tRPC invocation for notify.unreadCount is not wired yet.");
  });

  return command;
}
