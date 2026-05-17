import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
}));

import CommandPalette from "../../src/lib/components/command-palette/CommandPalette.svelte";
import type { CommandItem } from "../../src/lib/components/command-palette/command-palette-filter";
import { ALL_COMMANDS } from "../../src/lib/components/command-palette/navigation-commands";

const ITEMS: CommandItem[] = [
  { id: "task-1", label: "Open task", href: "/tasks/task-1" },
  { id: "doc-1", label: "Open runbook", href: "/docs/doc-1" },
];
const testDir = dirname(fileURLToPath(import.meta.url));

const domTest = typeof document === "undefined" ? test.skip : test;

afterEach(() => {
  vi.useRealTimers();
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }
});

describe("CmdK palette web component", () => {
  domTest("renders closed and open states from parent control", async () => {
    let open = false;
    const { container, queryByLabelText, rerender } = render(CommandPalette, {
      props: {
        open,
        items: ITEMS,
        onOpenChange: async (next: boolean) => {
          open = next;
          await rerender({ open });
        },
        onSelect: () => {},
      },
    });

    expect(container.querySelector("[data-command-palette]")?.getAttribute("data-state")).toBe("closed");
    expect(queryByLabelText("Command search")).toBeNull();

    await rerender({ open: true });
    expect(container.querySelector("[data-command-palette]")?.getAttribute("data-state")).toBe("open");
    expect(queryByLabelText("Command search")).toBeTruthy();
  });

  domTest("filters built-in command sections by query", async () => {
    const { getByLabelText, queryByText, getByText } = render(CommandPalette, {
      props: {
        open: true,
        items: ITEMS,
        onOpenChange: () => {},
        onSelect: () => {},
      },
    });

    const input = getByLabelText("Command search") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "documents" } });

    expect(getByText("Go to Documents")).toBeTruthy();
    expect(queryByText("Go to Projects")).toBeNull();
  });

  domTest("Enter selects the top legacy item through fallback handler", async () => {
    const selected: CommandItem[] = [];
    let open = true;

    const { getByLabelText } = render(CommandPalette, {
      props: {
        open,
        items: ITEMS,
        onOpenChange: (next: boolean) => {
          open = next;
        },
        onSelect: (item: CommandItem) => selected.push(item),
      },
    });

    const input = getByLabelText("Command search") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "runbook" } });
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(selected).toEqual([ITEMS[1]]);
    expect(open).toBe(false);
  });

  domTest("2+ character query enters search mode and shows empty state when index is unavailable", async () => {
    const { getByLabelText, getByText } = render(CommandPalette, {
      props: {
        open: true,
        items: ITEMS,
        onOpenChange: () => {},
        onSelect: () => {},
      },
    });

    const input = getByLabelText("Command search") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "zz" } });

    await waitFor(() => expect(getByText("Search Results")).toBeTruthy());
    expect(getByText("No results")).toBeTruthy();
  });

  test("built-in command routes resolve to SvelteKit pages", () => {
    const webRoot = join(testDir, "../../src/routes");
    const hrefs = ALL_COMMANDS.flatMap((command) => {
      const source = command.action?.toString() ?? "";
      const match = source.match(/(?:goto|navigate)\("([^"]+)"\)/);
      return match ? [match[1]] : [];
    });

    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs).not.toContain("/repos");
    for (const href of hrefs) {
      const routePath = href === "/" ? "+page.svelte" : join(href.slice(1), "+page.svelte");
      expect(existsSync(join(webRoot, routePath)), `${href} must resolve to a page route`).toBe(true);
    }
  });
});
