import { describe, expect, it } from "bun:test";

import { createFulcrumTuiRenderer } from "../../apps/tui/src/opentui/adapter.ts";
import type { TuiOutput } from "../../apps/tui/src/testing/fake-tty.ts";

describe("OpenTUI adapter", () => {
  it("testMode renderer writes render and status output to the provided TTY sink", async () => {
    const writes: string[] = [];
    const output: TuiOutput = {
      isTTY: false,
      columns: 100,
      rows: 30,
      write(chunk: string) {
        writes.push(chunk);
      },
    };

    const renderer = await createFulcrumTuiRenderer({ testMode: true, output });
    renderer.render("Task board");
    renderer.writeStatus("ready");
    renderer.dispose();

    expect(writes).toEqual(["Task board\n", "status: ready\n", ""]);
  });

  it("testMode can run with the built-in null output", async () => {
    const renderer = await createFulcrumTuiRenderer({ testMode: true });
    expect(() => renderer.render("No TTY")).not.toThrow();
    expect(() => renderer.writeStatus("quiet")).not.toThrow();
    expect(() => renderer.dispose()).not.toThrow();
  });
});
