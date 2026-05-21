import { describe, expect, test } from "bun:test";

import { MODE_AFFORDANCES, MODE_VERBS, run } from "./mode.ts";

/** Capture stdout/stderr/exit for one `fulcrum mode` invocation. */
function capture() {
  const lines: string[] = [];
  const errors: string[] = [];
  const exitCodes: number[] = [];
  return {
    lines,
    errors,
    exitCodes,
    print: (line: string) => lines.push(line),
    printErr: (line: string) => errors.push(line),
    exit: (code: number) => exitCodes.push(code),
  };
}

/**
 * fulcrum mode: the CLI side of the universal Step ModeAffordance
 * (`prd-web-mode-affordance-system`, DESIGN.md §4.13, CLI-TUI-UX.md §1).
 */
describe("fulcrum mode: per-step mode affordance verbs", () => {
  test("exposes one verb per canonical mode: manual / play / discuss / ai", () => {
    expect(MODE_VERBS).toEqual(["manual", "play", "discuss", "ai"]);
    expect(MODE_AFFORDANCES.map((m) => m.label)).toEqual([
      "Manual",
      "Play",
      "Discuss",
      "AI Assist",
    ]);
    // Glyphs mirror the web ModeRow primitive (DESIGN.md §4.13).
    expect(MODE_AFFORDANCES.map((m) => m.glyph)).toEqual(["✋", "▶", "💬", "⊞"]);
  });

  test("`mode list --json` emits the canonical fulcrum.cli.v1 envelope with all four modes", async () => {
    const io = capture();
    await run(["list", "--json"], io);

    expect(io.errors).toEqual([]);
    expect(io.exitCodes).toEqual([]);
    const envelope = JSON.parse(io.lines.at(-1) ?? "null");
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum mode list");
    expect(Array.isArray(envelope.result)).toBe(true);
    expect(envelope.result.map((m: { mode: string }) => m.mode)).toEqual([
      "manual",
      "play",
      "discuss",
      "assist",
    ]);
  });

  test("`mode play <step>` applies the Play mode and emits the envelope", async () => {
    const io = capture();
    await run(["play", "AUTH-42", "--agent", "codex", "--json"], io);

    expect(io.errors).toEqual([]);
    expect(io.exitCodes).toEqual([]);
    const envelope = JSON.parse(io.lines.at(-1) ?? "null");
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum mode play");
    expect(envelope.result).toMatchObject({
      step: "AUTH-42",
      mode: "play",
      verb: "play",
      agent: "codex",
    });
    // Trace identity is present so the moded Step is followable cross-surface.
    expect(typeof envelope.trace_id).toBe("string");
    expect(envelope.trace_id.length).toBeGreaterThan(0);
  });

  test("`mode ai <step>` maps to the web `assist` mode", async () => {
    const io = capture();
    await run(["ai", "doc_8f29", "--json"], io);

    const envelope = JSON.parse(io.lines.at(-1) ?? "null");
    expect(envelope.result.mode).toBe("assist");
    expect(envelope.result.glyph).toBe("⊞");
  });

  test("plain `mode discuss` output carries the glyph, label, and trace header line", async () => {
    const io = capture();
    await run(["discuss", "REV-7", "--note", "needs another pass"], io);

    expect(io.errors).toEqual([]);
    expect(io.exitCodes).toEqual([]);
    const text = io.lines.join("\n");
    expect(text).toContain("💬 Discuss: step REV-7");
    expect(text).toContain("note: needs another pass");
    // DESIGN.md §4.10 plain trace header line.
    expect(text).toContain("trace:");
  });

  test("a missing step id exits 2 with a usage message", async () => {
    const io = capture();
    await run(["play"], io);

    expect(io.exitCodes).toEqual([2]);
    expect(io.errors.join("\n")).toContain("missing required argument <step-id>");
  });

  test("an unknown mode verb exits 2", async () => {
    const io = capture();
    await run(["teleport", "AUTH-1"], io);

    expect(io.exitCodes).toEqual([2]);
    expect(io.errors.join("\n")).toContain("unknown mode 'teleport'");
  });

  test("`mode help` prints usage without exiting non-zero", async () => {
    const io = capture();
    await run(["help"], io);

    expect(io.exitCodes).toEqual([]);
    expect(io.lines.join("\n")).toContain("fulcrum mode");
    expect(io.lines.join("\n")).toContain("✋ Manual");
  });
});
