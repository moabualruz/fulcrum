import { describe, expect, test } from "bun:test";
import { FakeTTY } from "../testing/fake-tty.ts";
import { createFulcrumTuiRenderer } from "./adapter.ts";

describe("createFulcrumTuiRenderer", () => {
  test("returns a headless renderer API in test mode", async () => {
    const output = new FakeTTY({ columns: 72, rows: 20 });

    const renderer = await createFulcrumTuiRenderer({
      output,
      testMode: true,
    });

    expect(typeof renderer.render).toBe("function");
    expect(typeof renderer.writeStatus).toBe("function");
    expect(typeof renderer.dispose).toBe("function");

    renderer.render("Projects");
    renderer.writeStatus("OpenTUI gate ready");
    await renderer.dispose();

    const rendered = output.plainText();
    expect(rendered).toContain("Projects");
    expect(rendered).toContain("OpenTUI gate ready");
  });

  test("test mode does not require an interactive TTY", async () => {
    const output = new FakeTTY({ columns: 80, rows: 24 });

    const renderer = await createFulcrumTuiRenderer({
      output,
      testMode: true,
    });

    renderer.render("headless");
    await renderer.dispose();

    expect(output.plainText()).toContain("headless");
  });
});
