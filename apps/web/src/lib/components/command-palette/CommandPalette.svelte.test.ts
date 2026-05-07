import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

interface CommandItem {
  id: string;
  label: string;
  href?: string;
}

type CommandPaletteProps = {
  items: CommandItem[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelect: (item: CommandItem) => void;
};

const ITEMS: CommandItem[] = [
  { id: "runs", label: "Agent runs", href: "/runs" },
  { id: "docs", label: "Docs", href: "/docs" },
  { id: "projects", label: "Projects", href: "/projects" },
];

describe("CommandPalette component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let CommandPalette: Component<CommandPaletteProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./CommandPalette.svelte")) as {
      default: Component<CommandPaletteProps>;
    };
    CommandPalette = mod.default;
  });

  test('renders data-state="closed" and no input when open is false', () => {
    const { body } = render(CommandPalette, {
      props: { items: ITEMS, open: false, onOpenChange: () => {}, onSelect: () => {} },
    });
    expect(body).toMatch(/data-command-palette(?:="")?[^>]*data-state="closed"/);
    expect(body).not.toContain("data-command-palette-input");
  });

  test('renders data-state="open" and input when open is true', () => {
    const { body } = render(CommandPalette, {
      props: { items: ITEMS, open: true, onOpenChange: () => {}, onSelect: () => {} },
    });
    expect(body).toMatch(/data-command-palette(?:="")?[^>]*data-state="open"/);
    expect(body).toContain("data-command-palette-input");
  });

  test("renders one command item per item when query is empty", () => {
    const { body } = render(CommandPalette, {
      props: { items: ITEMS, open: true, onOpenChange: () => {}, onSelect: () => {} },
    });
    const matches = body.match(/data-command-palette-item/g) ?? [];
    expect(matches).toHaveLength(ITEMS.length);
  });
});
