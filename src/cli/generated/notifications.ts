import { Command, Option } from "commander";

export function createNotificationsCommand(): Command {
  const command = new Command("notifications");
  command.description("Generated notifications commands.");

  const channelsConfigCommand = command.command("channels config");
  channelsConfigCommand.description("notifications channels config");
  channelsConfigCommand.option("--json", "Emit JSON output");
  channelsConfigCommand.addOption(new Option("--channel <choice>", "channel").choices(["in-app","email","slack","webhook"]));
  channelsConfigCommand.option("--enabled", "enabled");
  channelsConfigCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.channels.config is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const channelsListCommand = command.command("channels list");
  channelsListCommand.description("notifications channels list");
  channelsListCommand.option("--json", "Emit JSON output");
  channelsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.channels.list is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const channelsTestCommand = command.command("channels test");
  channelsTestCommand.description("notifications channels test");
  channelsTestCommand.option("--json", "Emit JSON output");
  channelsTestCommand.addOption(new Option("--channel <choice>", "channel").choices(["in-app","email","slack","webhook"]));
  channelsTestCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.channels.test is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const listCommand = command.command("list");
  listCommand.description("notifications list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--offset <number>", "offset", Number.parseFloat);
  listCommand.option("--unread", "unread");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.list is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const markAllReadCommand = command.command("mark-all-read");
  markAllReadCommand.description("notifications markAllRead");
  markAllReadCommand.option("--json", "Emit JSON output");
  markAllReadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.markAllRead is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const markReadCommand = command.command("mark-read");
  markReadCommand.description("notifications markRead");
  markReadCommand.option("--json", "Emit JSON output");
  markReadCommand.option("--id <string>", "id");
  markReadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.markRead is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const muteCommand = command.command("mute");
  muteCommand.description("notifications mute");
  muteCommand.option("--json", "Emit JSON output");
  muteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.mute is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const quietHoursGetCommand = command.command("quiet-hours get");
  quietHoursGetCommand.description("notifications quietHours get");
  quietHoursGetCommand.option("--json", "Emit JSON output");
  quietHoursGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.quietHours.get is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const quietHoursSetCommand = command.command("quiet-hours set");
  quietHoursSetCommand.description("notifications quietHours set");
  quietHoursSetCommand.option("--json", "Emit JSON output");
  quietHoursSetCommand.option("--end-hour <number>", "end-hour", Number.parseFloat);
  quietHoursSetCommand.option("--start-hour <number>", "start-hour", Number.parseFloat);
  quietHoursSetCommand.option("--tz <string>", "tz");
  quietHoursSetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.quietHours.set is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const rulesCreateCommand = command.command("rules create");
  rulesCreateCommand.description("notifications rules create");
  rulesCreateCommand.option("--json", "Emit JSON output");
  rulesCreateCommand.option("--enabled", "enabled");
  rulesCreateCommand.option("--name <string>", "name");
  rulesCreateCommand.option("--subject-kind <string>", "subject-kind");
  rulesCreateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.rules.create is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const rulesDeleteCommand = command.command("rules delete");
  rulesDeleteCommand.description("notifications rules delete");
  rulesDeleteCommand.option("--json", "Emit JSON output");
  rulesDeleteCommand.option("--id <string>", "id");
  rulesDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.rules.delete is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const rulesGetCommand = command.command("rules get");
  rulesGetCommand.description("notifications rules get");
  rulesGetCommand.option("--json", "Emit JSON output");
  rulesGetCommand.option("--id <string>", "id");
  rulesGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.rules.get is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const rulesListCommand = command.command("rules list");
  rulesListCommand.description("notifications rules list");
  rulesListCommand.option("--json", "Emit JSON output");
  rulesListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.rules.list is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const rulesUpdateCommand = command.command("rules update");
  rulesUpdateCommand.description("notifications rules update");
  rulesUpdateCommand.option("--json", "Emit JSON output");
  rulesUpdateCommand.option("--enabled", "enabled");
  rulesUpdateCommand.option("--id <string>", "id");
  rulesUpdateCommand.option("--name <string>", "name");
  rulesUpdateCommand.option("--subject-kind <string>", "subject-kind");
  rulesUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.rules.update is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const unmuteCommand = command.command("unmute");
  unmuteCommand.description("notifications unmute");
  unmuteCommand.option("--json", "Emit JSON output");
  unmuteCommand.option("--subject-id <string>", "subject-id");
  unmuteCommand.option("--subject-kind <string>", "subject-kind");
  unmuteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.unmute is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const unreadCountCommand = command.command("unread-count");
  unreadCountCommand.description("notifications unreadCount");
  unreadCountCommand.option("--json", "Emit JSON output");
  unreadCountCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notifications.unreadCount is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}
