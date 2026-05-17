import { describe, expect, test } from "bun:test";
import { renderKeybindingHelp } from "@fulcrum/cli/keybindings.ts";
import { createTuiKeybindingMap } from "@fulcrum/tui/keybindings.ts";
import {
  createKeybind,
  getWebKeybindings,
} from "@fulcrum/web/lib/keybindings.ts";

describe("keybinding surface imports", () => {
  test("web, CLI, and TUI import the shared registry without duplicating actions", async () => {
    const settings = { get: async (key: string) => key === "keybinding.palette.open" ? "Ctrl+P" : undefined };

    const [web, tui] = await Promise.all([
      getWebKeybindings({ platform: "linux", settings }),
      createTuiKeybindingMap({ platform: "linux", settings }),
    ]);
    const cliHelp = await renderKeybindingHelp({ platform: "linux", settings });

    expect(web["palette.open"].key).toBe("Ctrl+P");
    expect(tui["palette.open"].key).toBe("Ctrl+P");
    expect(cliHelp).toContain("palette.open");
    expect(cliHelp).toContain("Ctrl+P");
    expect(createKeybind("palette.open").action).toBe("palette.open");
  });
});
