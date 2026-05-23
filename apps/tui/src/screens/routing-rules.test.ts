import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { RoutingRulesScreen } from "./routing-rules.ts";

describe("RoutingRulesScreen quit confirmation", () => {
  test("confirms before discarding routing rule draft", async () => {
    const screen = new RoutingRulesScreen({
      caller: {
        routing: {
          list: async () => [],
          create: async () => ({
            id: "rule-1",
            orgId: "org-1",
            projectId: null,
            name: "Rule",
            conditionsJson: {},
            actionAgent: "codex",
            actionSkillSet: [],
            priority: 100,
            enabled: true,
            source: "manual",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: async () => null,
          delete: async () => ({ ok: true }),
          test: async () => null,
          dryRun: async () => null,
          drafts: {
            list: async () => [],
            approve: async () => ({ ok: true }),
            delete: async () => ({ ok: true }),
            update: async () => ({ ok: true }),
          },
        },
      },
    });

    await screen.load();
    await screen.handleKey("n");
    expect(screen.hasUnsavedDraft).toBe(true);

    expect(await screen.handleKey("q")).toBe(true);
    expect(screen.quitConfirmationMessage).toBe("Unsaved edits. Quit? (y/n)");

    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const renderer = new Renderer(tty);
    screen.render(renderer);
    expect(tty.plainText()).toContain("Unsaved edits. Quit? (y/n)");
    expect(tty.plainText()).toContain("Discard routing rule draft changes.");

    await screen.handleKey("n");
    expect(screen.hasUnsavedDraft).toBe(true);
    expect(screen.quitConfirmationMessage).toBeNull();

    await screen.handleKey("q");
    await screen.handleKey("y");
    expect(screen.hasUnsavedDraft).toBe(false);
  });

  test("lets clean routing q bubble to shell", async () => {
    const screen = new RoutingRulesScreen({
      caller: {
        routing: {
          list: async () => [],
          create: async () => { throw new Error("not called"); },
          update: async () => null,
          delete: async () => ({ ok: true }),
          test: async () => null,
          dryRun: async () => null,
          drafts: {
            list: async () => [],
            approve: async () => ({ ok: true }),
            delete: async () => ({ ok: true }),
            update: async () => ({ ok: true }),
          },
        },
      },
    });

    await screen.load();
    expect(await screen.handleKey("q")).toBe(false);
    expect(screen.quitConfirmationMessage).toBeNull();
  });
});
