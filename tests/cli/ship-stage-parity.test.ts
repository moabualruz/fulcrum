/**
 * Ship stage CLI verb parity: `prd-cli-ship-stage-parity`.
 *
 * Proves the Ship workflow stage (CLI-TUI-UX.md §1.5) is a real, dispatchable
 * command grammar, not just `fulcrum artifacts`. The Ship stage host
 * (`apps/cli/src/commands/ship-stage.ts`) dispatches the seven §1.5 verb
 * groups: `artifact`, `release`, `ship`, `repo`, `branch`, `pr`, `memory` -
 * and every verb's `--json` output is the canonical `fulcrum.cli.v1` envelope
 * (CLI-TUI-UX.md §3).
 *
 * The OD reference is `ship.html`: its `Cut release` / `Roll back` /
 * `Pause rollout` / `Promote to 100%` actions become the
 * `fulcrum release cut|roll-back|pause|promote` CLI verbs. The release domain
 * model does not exist yet (design-alignment/ship.md §"Migration notes"); those
 * verbs are real dispatchable commands that emit a canonical *error* envelope
 * (`FUL_SHIP_RELEASE_UNAVAILABLE`): the honest non-mocked CLI behaviour: so
 * the envelope contract still holds.
 */

import { describe, expect, test } from "bun:test";

import {
  run as runShipStage,
  SHIP_STAGE_HELP,
  SHIP_VERB_GROUPS,
} from "../../apps/cli/src/commands/ship-stage.ts";
import { run as runArtifacts, ARTIFACT_VERBS } from "../../apps/cli/src/commands/artifacts.ts";
import { ENVELOPE_SCHEMA, isCanonicalEnvelope } from "../../apps/cli/src/lib/envelope.ts";

/** The twelve canonical `fulcrum.cli.v1` envelope keys (CLI-TUI-UX.md §3). */
const CANONICAL_KEYS = [
  "args",
  "command",
  "duration_ms",
  "errors",
  "next_actions",
  "project_id",
  "result",
  "run_id",
  "schema",
  "span_id",
  "timestamp",
  "trace_id",
] as const;

/** Capture stdout/stderr and provide a non-zero-exit-throwing harness. */
function harness() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => {
        if (code !== 0) throw new Error(`exit ${code}`);
      },
    },
  };
}

/** Assert a parsed object is the canonical 12-key `fulcrum.cli.v1` envelope. */
function expectCanonicalEnvelope(line: string, command: string): Record<string, unknown> {
  const parsed = JSON.parse(line) as Record<string, unknown>;
  const expectedCommand = command.startsWith("fulcrum ") ? command : `fulcrum ${command}`;
  expect(isCanonicalEnvelope(parsed)).toBe(true);
  expect(Object.keys(parsed).sort()).toEqual([...CANONICAL_KEYS]);
  expect(parsed["schema"]).toBe(ENVELOPE_SCHEMA);
  expect(parsed["command"]).toBe(expectedCommand);
  expect(typeof parsed["trace_id"]).toBe("string");
  expect((parsed["trace_id"] as string).length).toBe(32);
  expect(typeof parsed["span_id"]).toBe("string");
  expect((parsed["span_id"] as string).length).toBe(16);
  expect(Array.isArray(parsed["errors"])).toBe(true);
  expect(Array.isArray(parsed["next_actions"])).toBe(true);
  return parsed;
}

describe("Ship stage CLI verb grammar (CLI-TUI-UX.md §1.5)", () => {
  test("the Ship stage host exposes the seven §1.5 verb groups", () => {
    // ship.md: Ship owns artifact, release, repo, branch, pr, memory verbs,
    // plus the `ship` stage launcher itself.
    expect([...SHIP_VERB_GROUPS].sort()).toEqual([
      "artifact",
      "branch",
      "memory",
      "pr",
      "release",
      "repo",
      "ship",
    ]);
  });

  test("`fulcrum ship` with no verb prints the stage help, not an error", async () => {
    const h = harness();
    await runShipStage([], h.opts);
    expect(h.out.join("\n")).toContain("fulcrum ship");
    expect(SHIP_STAGE_HELP).toContain("release");
    expect(SHIP_STAGE_HELP).toContain("artifact");
    expect(h.err).toHaveLength(0);
  });

  test("an unknown Ship group exits non-zero with the stage help", async () => {
    const h = harness();
    await expect(runShipStage(["nonsense", "list"], h.opts)).rejects.toThrow("exit 2");
    expect(h.err.join("\n")).toContain("unknown");
  });
});

describe("Ship verb dispatch: canonical fulcrum.cli.v1 envelope", () => {
  test("`fulcrum ship list --json` dispatches and emits the canonical envelope", async () => {
    const h = harness();
    await runShipStage(["ship", "list", "--json"], h.opts);
    expect(h.out).toHaveLength(1);
    const env = expectCanonicalEnvelope(h.out[0]!, "ship list");
    // `ship list` is the release-list launcher; result is a structured object.
    expect(env["result"]).toBeDefined();
  });

  test("`fulcrum ship view <id> --json` dispatches and emits the canonical envelope", async () => {
    const h = harness();
    await runShipStage(["ship", "view", "fulcrum-server@0.18.0", "--json"], h.opts);
    expect(h.out).toHaveLength(1);
    expectCanonicalEnvelope(h.out[0]!, "ship view");
  });

  test.each([
    ["cut", "release cut"],
    ["roll-back", "release roll-back"],
    ["pause", "release pause"],
    ["promote", "release promote"],
  ])(
    "`fulcrum release %s --json` is a real verb that emits the canonical envelope",
    async (verb, command) => {
      const h = harness();
      // The release domain model does not exist yet: the verb is still a real
      // dispatchable command and still emits the canonical envelope, carrying a
      // coded error in the always-array `errors` field.
      await runShipStage(["release", verb, "--json"], h.opts);
      expect(h.out).toHaveLength(1);
      const env = expectCanonicalEnvelope(h.out[0]!, command);
      const errors = env["errors"] as { code: string }[];
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe("FUL_SHIP_RELEASE_UNAVAILABLE");
      expect(env["result"]).toBeNull();
    },
  );

  test("`fulcrum release cut` plain output prints the recovery block to stderr", async () => {
    const h = harness();
    await runShipStage(["release", "cut"], h.opts);
    // Plain mode prints the COPY.md §3 recovery block (message + Fix: + trace=).
    const stderr = h.err.join("\n");
    expect(stderr).toContain("Fix:");
    expect(stderr).toContain("trace=");
  });

  test.each(["repo", "branch", "pr", "memory"])(
    "`fulcrum ship %s list --json` dispatches and emits the canonical envelope",
    async (group) => {
      const h = harness();
      await runShipStage([group, "list", "--json"], h.opts);
      expect(h.out).toHaveLength(1);
      expectCanonicalEnvelope(h.out[0]!, `${group} list`);
    },
  );
});

describe("artifact verbs re-homed under Ship (artifacts kept as alias)", () => {
  test("the re-homed artifact verbs cover list/view/diff/export/download", () => {
    const verbs: readonly string[] = ARTIFACT_VERBS;
    for (const verb of ["list", "view", "diff", "export", "download"]) {
      expect(verbs).toContain(verb);
    }
  });

  test("`fulcrum artifact list --json` emits the canonical envelope (re-homed verb)", async () => {
    const h = harness();
    const caller = {
      artifacts: {
        list: async () => [{ id: "art-1", filename: "release-v2.tgz", mime: "application/gzip" }],
        get: async () => ({}),
        upload: async () => ({}),
        accept: async () => ({}),
        reject: async () => ({}),
        download: async () => ({}),
        diff: async () => ({}),
        export: async () => ({}),
        archive: async () => ({}),
        unarchive: async () => ({}),
        delete: async () => ({}),
      },
    };
    await runArtifacts(["list", "--json"], { ...h.opts, caller });
    expect(h.out).toHaveLength(1);
    const env = expectCanonicalEnvelope(h.out[0]!, "artifact list");
    expect(Array.isArray(env["result"])).toBe(true);
  });

  test("`fulcrum artifact view <id>` is an alias for the legacy `show` verb", async () => {
    const h = harness();
    let gotId = "";
    const caller = {
      artifacts: {
        list: async () => [],
        get: async (input: { id: string }) => {
          gotId = input.id;
          return { id: input.id, filename: "release-v2.tgz" };
        },
        upload: async () => ({}),
        accept: async () => ({}),
        reject: async () => ({}),
        download: async () => ({}),
        diff: async () => ({}),
        export: async () => ({}),
        archive: async () => ({}),
        unarchive: async () => ({}),
        delete: async () => ({}),
      },
    };
    await runArtifacts(["view", "art-9", "--json"], { ...h.opts, caller });
    expect(gotId).toBe("art-9");
    expectCanonicalEnvelope(h.out[0]!, "artifact view");
  });

  test("`fulcrum ship artifact list --json` routes through the Ship stage host", async () => {
    const h = harness();
    const caller = {
      artifacts: {
        list: async () => [{ id: "art-1" }],
        get: async () => ({}),
        upload: async () => ({}),
        accept: async () => ({}),
        reject: async () => ({}),
        download: async () => ({}),
        diff: async () => ({}),
        export: async () => ({}),
        archive: async () => ({}),
        unarchive: async () => ({}),
        delete: async () => ({}),
      },
    };
    await runShipStage(["artifact", "list", "--json"], { ...h.opts, artifactsCaller: caller });
    expect(h.out).toHaveLength(1);
    expectCanonicalEnvelope(h.out[0]!, "artifact list");
  });

  test("`fulcrum artifacts list` (legacy alias) still works and emits the envelope", async () => {
    const h = harness();
    const caller = {
      artifacts: {
        list: async () => [],
        get: async () => ({}),
        upload: async () => ({}),
        accept: async () => ({}),
        reject: async () => ({}),
        download: async () => ({}),
        diff: async () => ({}),
        export: async () => ({}),
        archive: async () => ({}),
        unarchive: async () => ({}),
        delete: async () => ({}),
      },
    };
    // Legacy spelling `artifacts` is preserved (CLI review fix A-CLI-001).
    await runArtifacts(["list", "--json"], { ...h.opts, caller });
    expectCanonicalEnvelope(h.out[0]!, "artifact list");
  });
});
