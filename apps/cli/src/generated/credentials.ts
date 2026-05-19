import { Command, Option } from "commander";

export function createCredentialsCommand(): Command {
  const command = new Command("credentials");
  command.description("Generated credentials commands.");

  const archiveCommand = command.command("archive");
  archiveCommand.description("credentials archive");
  archiveCommand.option("--json", "Emit JSON output");
  archiveCommand.option("--confirm <string>", "Required confirmation token for archival; must match credential name.");
  archiveCommand.option("--name <string>", "name");
  archiveCommand.option("--user-id <string>", "user-id");
  archiveCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.archive requires an explicit surface adapter.");
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

  const getCommand = command.command("get");
  getCommand.description("credentials get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--name <string>", "name");
  getCommand.option("--user-id <string>", "user-id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.get requires an explicit surface adapter.");
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
  listCommand.description("credentials list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "include-archived");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.list requires an explicit surface adapter.");
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

  const removeCommand = command.command("remove");
  removeCommand.description("credentials remove");
  removeCommand.option("--json", "Emit JSON output");
  removeCommand.option("--confirm <string>", "Required confirmation token for removal; must match credential name.");
  removeCommand.option("--name <string>", "name");
  removeCommand.option("--user-id <string>", "user-id");
  removeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.remove requires an explicit surface adapter.");
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

  const rotateCommand = command.command("rotate");
  rotateCommand.description("credentials rotate");
  rotateCommand.option("--json", "Emit JSON output");
  rotateCommand.option("--confirm <string>", "Required confirmation token for rotation; must match credential name.");
  rotateCommand.option("--name <string>", "name");
  rotateCommand.option("--new-value <string>", "new-value");
  rotateCommand.option("--user-id <string>", "user-id");
  rotateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.rotate requires an explicit surface adapter.");
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

  const setCommand = command.command("set");
  setCommand.description("credentials set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--confirm <string>", "Required confirmation token for setting a credential; must match credential name.");
  setCommand.option("--name <string>", "name");
  setCommand.option("--value <string>", "value");
  setCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for credentials.set requires an explicit surface adapter.");
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
