import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

/**
 * SSR smoke coverage for the canonical `CommandPalette` shell component.
 *
 * The palette content (sections, rows, scope chip) is portalled by the
 * `@fulcrum/ui-kit` `command-palette` primitive, which — like every bits-ui
 * `Dialog.Portal` — renders nothing during server render. So SSR can only
 * prove the component mounts and exposes its outer `data-command-palette`
 * state wrapper without crashing. The section MODEL and Scope rule are pure
 * and unit-tested in `palette-sections.test.ts` + `palette-scope.test.ts`;
 * the rendered DOM (section order, chip, keyboard nav) is proven by the
 * Playwright design-e2e spec `tests/design-e2e/palette.spec.ts`.
 */

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

mock.module("mode-watcher", () => ({ toggleMode: () => {}, ModeWatcher: () => "" }));

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
  { id: "docs", label: "Documents", href: "/docs" },
  { id: "projects", label: "Projects", href: "/projects" },
];

describe("CommandPalette shell component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let CommandPalette: Component<CommandPaletteProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./CommandPalette.svelte")) as {
      default: Component<CommandPaletteProps>;
    };
    CommandPalette = mod.default;
  });

  test('renders the data-command-palette wrapper with data-state="closed"', () => {
    const { body } = render(CommandPalette, {
      props: { items: ITEMS, open: false, onOpenChange: () => {}, onSelect: () => {} },
    });
    expect(body).toMatch(/data-command-palette(?:="")?[^>]*data-state="closed"/);
  });

  test('renders the data-command-palette wrapper with data-state="open"', () => {
    const { body } = render(CommandPalette, {
      props: { items: ITEMS, open: true, onOpenChange: () => {}, onSelect: () => {} },
    });
    expect(body).toMatch(/data-command-palette(?:="")?[^>]*data-state="open"/);
  });

  test("mounts without throwing when no items are supplied", () => {
    expect(() =>
      render(CommandPalette, {
        props: { items: [], open: true, onOpenChange: () => {}, onSelect: () => {} },
      }),
    ).not.toThrow();
  });
});
