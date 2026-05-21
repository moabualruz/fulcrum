import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { CLI_TUI_PARITY_MATRIX } from "@fulcrum/cli/cli-tui-parity.ts";
import { run as runCliTuiParity } from "@fulcrum/cli/commands/cli-tui-parity.ts";
import { ENVELOPE_SCHEMA, isCanonicalEnvelope } from "@fulcrum/cli/lib/envelope.ts";
import { listTuiParityKeyPaths, resolveCliTuiParityRoute } from "@fulcrum/tui/cli-tui-parity.ts";
import { TUI_STAGE_NAV } from "@fulcrum/tui/screen-registry.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
    },
  };
}

function normalizeCell(value: string): string {
  return value
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\/\s+/g, " / ")
    .replace(/→/g, "->")
    .trim();
}

function specParityRows(source: string): Array<{ cli: string; tui: string }> {
  const section = source.split("## 13. CLI ↔ TUI parity table")[1]?.split("Invariants:")[0];
  if (!section) throw new Error("CLI-TUI-UX.md §13 not found.");
  return section
    .split("\n")
    .filter((line) => line.startsWith("| `") || line.startsWith("| fulcrum"))
    .map((line) => line.replace(/^\|\s*/, "").replace(/\s*\|$/, "").split(/\s\|\s/).slice(0, 2).map((cell) => normalizeCell(cell)))
    .map(([cli, tui]) => ({ cli: cli!, tui: tui! }));
}

describe("CLI/TUI parity matrix (CLI-TUI-UX.md §13)", () => {
  test("matrix matches every CLI/TUI row from the spec table", async () => {
    const spec = await readFile(new URL("../../CLI-TUI-UX.md", import.meta.url), "utf8");
    const expected = specParityRows(spec);
    const actual = CLI_TUI_PARITY_MATRIX.map((row) => ({
      cli: normalizeCell(row.cli),
      tui: normalizeCell(row.tui),
    }));

    expect(actual).toEqual(expected);
  });

  test("every matrix row has a stage group and a resolvable TUI route/key path", () => {
    const stageLabels = new Set(TUI_STAGE_NAV.map((stage) => stage.label));

    for (const row of CLI_TUI_PARITY_MATRIX) {
      expect(stageLabels.has(row.stage as (typeof TUI_STAGE_NAV)[number]["label"]) || row.stage === "System").toBe(true);
      expect(resolveCliTuiParityRoute(row)).toBeTruthy();
      expect(row.keyPath.length).toBeGreaterThan(0);
    }

    const stageCoverage = new Set(CLI_TUI_PARITY_MATRIX.map((row) => row.stage));
    expect(stageCoverage).toEqual(new Set(["Build", "Review", "Ship", "Operate", "System", "Capture"]));
  });

  test("TUI key-path evidence covers representative rows for every stage group", () => {
    const keyPaths = listTuiParityKeyPaths();

    expect(keyPaths.length).toBe(CLI_TUI_PARITY_MATRIX.length);
    expect(keyPaths.find((row) => row.cli === "fulcrum runs feed --watch")?.keyPath).toEqual([":", "runs"]);
    expect(keyPaths.find((row) => row.cli === "fulcrum task list --sort <field>:<asc|desc>")?.keyPath).toEqual([":", "list", "s"]);
    expect(keyPaths.find((row) => row.cli === "fulcrum agent add <id> --client <kind>")?.keyPath).toEqual([":", "agents", "a"]);
    expect(keyPaths.find((row) => row.cli === "fulcrum doctor --probe <subsystem>")?.keyPath).toEqual([":", "doctor", "Enter"]);
  });

  test("fulcrum parity cli-tui emits plain output and canonical JSON evidence", async () => {
    const plain = capture();
    await runCliTuiParity([], plain.io);

    expect(plain.err).toEqual([]);
    expect(plain.out.join("\n")).toContain("CLI/TUI parity matrix");
    expect(plain.out.join("\n")).toContain("fulcrum runs feed --watch");
    expect(plain.out.join("\n")).toContain(":doc/<id>");

    const json = capture();
    await runCliTuiParity(["--json"], json.io);
    expect(json.err).toEqual([]);
    expect(json.out).toHaveLength(1);

    const envelope = JSON.parse(json.out[0]!);
    expect(isCanonicalEnvelope(envelope)).toBe(true);
    expect(envelope.schema).toBe(ENVELOPE_SCHEMA);
    expect(envelope.command).toBe("fulcrum parity cli-tui");
    expect(envelope.result.rows).toHaveLength(CLI_TUI_PARITY_MATRIX.length);
    expect(envelope.result.rows[0]).toMatchObject({
      cli: "fulcrum runs feed --watch",
      route: ":runs",
    });
  });
});
