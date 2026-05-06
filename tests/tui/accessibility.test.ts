import { describe, expect, test } from "bun:test";

import { Renderer } from "../../src/tui/renderer.ts";
import {
  ACCESSIBLE_STATUS_LABELS,
  renderFocusableRow,
  renderHighContrastLegend,
} from "../../src/tui/screens/accessibility.ts";
import { SettingsTabs } from "../../src/tui/screens/settings.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

function renderPlain(render: (renderer: Renderer) => void): string {
  const tty = new FakeTTY({ columns: 100, rows: 30 });
  render(new Renderer(tty));
  return tty.plainText();
}

describe("TUI accessibility contracts", () => {
  test("every settings screen is reachable with keyboard input through FakeTTY", async () => {
    const tty = new FakeTTY();
    const tabs = new SettingsTabs();
    const visited = new Set([tabs.current]);

    tty.on("keypress", (key) => {
      void tabs.handleKey(key);
    });

    for (let index = 0; index < 7; index += 1) {
      tty.inject("\t");
      await Bun.sleep(0);
      visited.add(tabs.current);
    }

    expect([...visited].sort()).toEqual(["backup", "data", "errors", "flags", "secrets", "telemetry", "theme"]);
  });

  test("selected row includes visible text marker, not only ANSI color", () => {
    const output = renderPlain((renderer) => {
      renderFocusableRow(renderer, "Secrets", true);
      renderFocusableRow(renderer, "Audit", false);
    });

    expect(output).toContain("> focused Secrets");
    expect(output).toContain("idle Audit");
  });

  test("high contrast theme renders labels and enabled or disabled status words", () => {
    const output = renderPlain(renderHighContrastLegend);

    expect(output).toContain("High contrast");
    expect(output).toContain("enabled");
    expect(output).toContain("disabled");
  });

  test("icon and status cells expose non-color status labels", () => {
    const output = renderPlain(renderHighContrastLegend);

    for (const label of ACCESSIBLE_STATUS_LABELS) {
      expect(output).toContain(label);
    }
  });
});
