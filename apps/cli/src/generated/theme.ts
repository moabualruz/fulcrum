import { Command, Option } from "commander";

export function createThemeCommand(): Command {
  const command = new Command("theme");
  command.description("Generated theme commands.");

  const getCommand = command.command("get");
  getCommand.description("theme get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for theme.get requires an explicit surface adapter.");
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

  const getThemeCommand = command.command("get-theme");
  getThemeCommand.description("theme getTheme");
  getThemeCommand.option("--json", "Emit JSON output");
  getThemeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for theme.getTheme requires an explicit surface adapter.");
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

  const listThemesCommand = command.command("list-themes");
  listThemesCommand.description("theme listThemes");
  listThemesCommand.option("--json", "Emit JSON output");
  listThemesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for theme.listThemes requires an explicit surface adapter.");
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

  const setThemeCommand = command.command("set-theme");
  setThemeCommand.description("theme setTheme");
  setThemeCommand.option("--json", "Emit JSON output");
  setThemeCommand.option("--value <string>", "value");
  setThemeCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for theme.setTheme requires an explicit surface adapter.");
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

  const updateCommand = command.command("update");
  updateCommand.description("theme update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--accent-hue <number>", "accent-hue", Number.parseFloat);
  updateCommand.option("--accent-lightness <number>", "accent-lightness", Number.parseFloat);
  updateCommand.option("--accent-saturation <number>", "accent-saturation", Number.parseFloat);
  updateCommand.addOption(new Option("--animation-speed <choice>", "animation-speed").choices(["normal","reduced","off"]));
  updateCommand.addOption(new Option("--color-scheme <choice>", "color-scheme").choices(["light","dark","auto"]));
  updateCommand.option("--compact-mode", "compact-mode");
  updateCommand.addOption(new Option("--font-family <choice>", "font-family").choices(["inter","system","mono"]));
  updateCommand.addOption(new Option("--preset <choice>", "preset").choices(["default","ocean","forest","sunset","monochrome"]));
  updateCommand.option("--radius <number>", "radius", Number.parseFloat);
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for theme.update requires an explicit surface adapter.");
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
