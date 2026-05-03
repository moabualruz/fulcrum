import { Command, Option } from "commander";

export function createNotifyCommand(): Command {
  const command = new Command("notify");
  command.description("Generated notify commands.");

  const channelsConfigCommand = command.command("channels config");
  channelsConfigCommand.description("notify channels config");
  channelsConfigCommand.option("--json", "Emit JSON output");
  channelsConfigCommand.addOption(new Option("--channel <choice>", "channel").choices(["in-app","email","slack","discord","webhook","push"]));
  channelsConfigCommand.option("--email <string>", "email");
  channelsConfigCommand.option("--enabled", "enabled");
  channelsConfigCommand.option("--secret <string>", "secret");
  channelsConfigCommand.option("--subscription <string>", "subscription");
  channelsConfigCommand.option("--token <string>", "token");
  channelsConfigCommand.option("--url <string>", "url");
  channelsConfigCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.channels.config is not wired yet.");
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
  channelsListCommand.description("notify channels list");
  channelsListCommand.option("--json", "Emit JSON output");
  channelsListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.channels.list is not wired yet.");
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
  channelsTestCommand.description("notify channels test");
  channelsTestCommand.option("--json", "Emit JSON output");
  channelsTestCommand.addOption(new Option("--channel <choice>", "channel").choices(["in-app","email","slack","discord","webhook","push"]));
  channelsTestCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.channels.test is not wired yet.");
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
  listCommand.description("notify list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "Maximum notifications to return.", Number.parseFloat);
  listCommand.option("--offset <number>", "Pagination offset.", Number.parseFloat);
  listCommand.option("--unread", "Filter to unread notifications.");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.list is not wired yet.");
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
  markAllReadCommand.description("notify markAllRead");
  markAllReadCommand.option("--json", "Emit JSON output");
  markAllReadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.markAllRead is not wired yet.");
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
  markReadCommand.description("notify markRead");
  markReadCommand.option("--json", "Emit JSON output");
  markReadCommand.option("--id <string>", "Notification identifier.");
  markReadCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.markRead is not wired yet.");
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
  muteCommand.description("notify mute");
  muteCommand.option("--json", "Emit JSON output");
  muteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.mute is not wired yet.");
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

  const mutesListCommand = command.command("mutes list");
  mutesListCommand.description("notify mutes list");
  mutesListCommand.option("--json", "Emit JSON output");
  mutesListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.mutes.list is not wired yet.");
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
  quietHoursGetCommand.description("notify quietHours get");
  quietHoursGetCommand.option("--json", "Emit JSON output");
  quietHoursGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.quietHours.get is not wired yet.");
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
  quietHoursSetCommand.description("notify quietHours set");
  quietHoursSetCommand.option("--json", "Emit JSON output");
  quietHoursSetCommand.option("--end-hour <number>", "Quiet-hours end hour.", Number.parseFloat);
  quietHoursSetCommand.option("--start-hour <number>", "Quiet-hours start hour.", Number.parseFloat);
  quietHoursSetCommand.option("--tz <string>", "IANA time zone.");
  quietHoursSetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.quietHours.set is not wired yet.");
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
  rulesCreateCommand.description("notify rules create");
  rulesCreateCommand.option("--json", "Emit JSON output");
  rulesCreateCommand.option("--enabled", "Whether rule is active.");
  rulesCreateCommand.option("--name <string>", "Notification rule name.");
  rulesCreateCommand.option("--subject-kind <string>", "Optional subject type scope.");
  rulesCreateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.rules.create is not wired yet.");
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
  rulesDeleteCommand.description("notify rules delete");
  rulesDeleteCommand.option("--json", "Emit JSON output");
  rulesDeleteCommand.option("--id <string>", "Notification identifier.");
  rulesDeleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.rules.delete is not wired yet.");
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
  rulesGetCommand.description("notify rules get");
  rulesGetCommand.option("--json", "Emit JSON output");
  rulesGetCommand.option("--id <string>", "Notification identifier.");
  rulesGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.rules.get is not wired yet.");
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
  rulesListCommand.description("notify rules list");
  rulesListCommand.option("--json", "Emit JSON output");
  rulesListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.rules.list is not wired yet.");
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
  rulesUpdateCommand.description("notify rules update");
  rulesUpdateCommand.option("--json", "Emit JSON output");
  rulesUpdateCommand.option("--enabled", "Whether rule is active.");
  rulesUpdateCommand.option("--id <string>", "Notification rule identifier.");
  rulesUpdateCommand.option("--name <string>", "Notification rule name.");
  rulesUpdateCommand.option("--subject-kind <string>", "Optional subject type scope.");
  rulesUpdateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.rules.update is not wired yet.");
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
  unmuteCommand.description("notify unmute");
  unmuteCommand.option("--json", "Emit JSON output");
  unmuteCommand.option("--subject-id <string>", "Notification subject identifier.");
  unmuteCommand.option("--subject-kind <string>", "Notification subject type.");
  unmuteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.unmute is not wired yet.");
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
  unreadCountCommand.description("notify unreadCount");
  unreadCountCommand.option("--json", "Emit JSON output");
  unreadCountCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for notify.unreadCount is not wired yet.");
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
