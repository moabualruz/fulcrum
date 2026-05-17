import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type AnnouncerProps = { message: string | null };

describe("KeyboardMoveAnnouncer (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let KeyboardMoveAnnouncer: Component<AnnouncerProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./KeyboardMoveAnnouncer.svelte")) as {
      default: Component<AnnouncerProps>;
    };
    KeyboardMoveAnnouncer = mod.default;
  });

  test("renders an empty polite live region when message is null", () => {
    const { body } = render(KeyboardMoveAnnouncer, { props: { message: null } });
    expect(body).toMatch(/data-keyboard-announcer\b[^>]*aria-live="polite"/);
    expect(body).toMatch(/aria-atomic="true"/);
    // No message text rendered; the wrapper is otherwise empty.
    const inner = body.match(/<div[^>]*data-keyboard-announcer[^>]*>([\s\S]*?)<\/div>/);
    expect(inner).not.toBeNull();
    expect((inner?.[1] ?? "").trim()).toBe("");
  });

  test("renders the message text inside the live region when provided", () => {
    const message = "Moved 'Wire UI' from Pending to In progress.";
    const { body } = render(KeyboardMoveAnnouncer, { props: { message } });
    expect(body).toMatch(/data-keyboard-announcer\b[^>]*aria-live="polite"/);
    expect(body).toContain(message);
  });
});
