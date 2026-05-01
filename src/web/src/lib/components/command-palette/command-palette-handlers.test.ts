import { describe, expect, test } from "bun:test";

import {
  makeKeydownHandler,
  makeSelect,
  type CommandItem,
} from "./command-palette-handlers";

type KeyEventInput = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

function keyEvent(input: KeyEventInput) {
  let prevented = false;
  const event = {
    key: input.key,
    metaKey: input.metaKey ?? false,
    ctrlKey: input.ctrlKey ?? false,
    preventDefault: () => {
      prevented = true;
    },
  } as Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "preventDefault">;

  return { event: event as KeyboardEvent, prevented: () => prevented };
}

const ITEMS: CommandItem[] = [
  { id: "runs", label: "Agent runs" },
  { id: "docs", label: "Docs" },
];

describe("makeKeydownHandler", () => {
  test("cmd+K toggles open state and prevents default", () => {
    const changes: boolean[] = [];
    const { event, prevented } = keyEvent({ key: "k", metaKey: true });

    makeKeydownHandler(false, (next) => changes.push(next))(event);

    expect(changes).toEqual([true]);
    expect(prevented()).toBe(true);
  });

  test("ctrl+K toggles open state", () => {
    const changes: boolean[] = [];
    const { event } = keyEvent({ key: "K", ctrlKey: true });

    makeKeydownHandler(true, (next) => changes.push(next))(event);

    expect(changes).toEqual([false]);
  });

  test("Escape closes only while open", () => {
    const changes: boolean[] = [];
    const { event } = keyEvent({ key: "Escape" });

    makeKeydownHandler(true, (next) => changes.push(next))(event);

    expect(changes).toEqual([false]);
  });
});

describe("makeSelect", () => {
  test("selects top scored item exactly once and closes", () => {
    const selected: CommandItem[] = [];
    const changes: boolean[] = [];

    makeSelect(ITEMS, "doc", (item) => selected.push(item), (next) => changes.push(next))();

    expect(selected.map((item) => item.id)).toEqual(["docs"]);
    expect(changes).toEqual([false]);
  });

  test("does nothing when no item matches", () => {
    const selected: CommandItem[] = [];
    const changes: boolean[] = [];

    makeSelect(ITEMS, "zzz", (item) => selected.push(item), (next) => changes.push(next))();

    expect(selected).toHaveLength(0);
    expect(changes).toHaveLength(0);
  });
});
