import { Command, Option } from "commander";
import { createThemeSettingsApiCallerFromEnv } from "@platform-core/interface/http/theme-settings-api-client.ts";

export function createThemeCommand(): Command {
  const command = new Command("theme");
  command.description("Generated theme commands.");

  const getCommand = command.command("get");
  getCommand.description("theme get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await themeClient().get());
  });

  const getThemeCommand = command.command("get-theme");
  getThemeCommand.description("theme getTheme");
  getThemeCommand.option("--json", "Emit JSON output");
  getThemeCommand.option("--key <string>", "theme key");
  getThemeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await themeClient().getTheme({ key: requiredOption(options, "key") })
    );
  });

  const listThemesCommand = command.command("list-themes");
  listThemesCommand.description("theme listThemes");
  listThemesCommand.option("--json", "Emit JSON output");
  listThemesCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await themeClient().listThemes());
  });

  const setThemeCommand = command.command("set-theme");
  setThemeCommand.description("theme setTheme");
  setThemeCommand.option("--json", "Emit JSON output");
  setThemeCommand.option("--key <string>", "theme key");
  setThemeCommand.option("--value <string>", "value");
  setThemeCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await themeClient().setTheme({
        key: requiredOption(options, "key"),
        value: requiredOption(options, "value"),
      })
    );
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
    await runGeneratedAction(options, async () =>
      await themeClient().update(compact({
        accentHue: options.accentHue,
        accentLightness: options.accentLightness,
        accentSaturation: options.accentSaturation,
        animationSpeed: options.animationSpeed,
        colorScheme: options.colorScheme,
        compactMode: options.compactMode,
        fontFamily: options.fontFamily,
        preset: options.preset,
        radius: options.radius,
      }))
    );
  });

  return command;
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

function themeClient() {
  const caller = createThemeSettingsApiCallerFromEnv();
  if (!caller) {
    throw new Error("Theme settings API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.");
  }
  return caller.theme;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else console.log(result);
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
