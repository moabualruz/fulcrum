import { describe, expect, test } from "bun:test";

type RepoRow = {
  id: string;
  slug: string;
  branch: string | null;
  dirty: boolean;
  lastSyncAt: string | null;
  openTaskCount: number;
};

const ROW: RepoRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "fulcrum",
  branch: "dev/v1.0",
  dirty: true,
  lastSyncAt: "2026-05-05T20:00:00.000Z",
  openTaskCount: 4,
};

function fakeCaller() {
  const calls: unknown[] = [];
  return {
    calls,
    repos: {
      register: async (input: unknown) => {
        calls.push(["register", input]);
        return ROW;
      },
      list: async (input?: unknown) => {
        calls.push(["list", input]);
        return [ROW];
      },
      get: async (input: unknown) => {
        calls.push(["get", input]);
        return ROW;
      },
      syncRepo: async (input: unknown) => {
        calls.push(["syncRepo", input]);
        return { repoId: ROW.id, status: "queued", taskName: "repo.sync.local", jobKey: `repo.sync.local:${ROW.id}` };
      },
      unregister: async (input: unknown) => {
        calls.push(["unregister", input]);
        return { ...ROW, archived: true };
      },
      branches: async (input: unknown) => {
        calls.push(["branches", input]);
        return [{ name: "dev/v1.0", isCurrent: true, sha: "abcdef1" }];
      },
      commits: async (input: unknown) => {
        calls.push(["commits", input]);
        return [{ sha: "abcdef1", message: "feat: repos", author: "M", committedAt: "2026-05-05T20:00:00.000Z" }];
      },
      files: async (input: unknown) => {
        calls.push(["files", input]);
        return [{ path: "src/index.ts", kind: "file", size: 123 }];
      },
    },
  };
}

describe("repos CLI parity contract", () => {
  test("list --json prints stable dashboard fields", async () => {
    const { run } = await import("./repos.ts");
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["list", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    const parsed = JSON.parse(lines[0] as string) as RepoRow[];
    expect(caller.calls[0]).toEqual(["list", undefined]);
    expect(parsed[0]).toEqual(ROW);
    expect(Object.keys(parsed[0] ?? {}).sort()).toEqual([
      "branch",
      "dirty",
      "id",
      "lastSyncAt",
      "openTaskCount",
      "slug",
    ]);
  });

  test("read-only detail verbs support --json through repos caller", async () => {
    const { run } = await import("./repos.ts");
    const caller = fakeCaller();
    const lines: string[] = [];
    const opts = {
      caller,
      print: (line: string) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    };

    await run(["branches", ROW.id, "--json"], opts);
    await run(["commits", ROW.id, "--json"], opts);
    await run(["files", ROW.id, "--json"], opts);

    expect(caller.calls.slice(0, 3)).toEqual([
      ["branches", { id: ROW.id }],
      ["commits", { id: ROW.id }],
      ["files", { id: ROW.id }],
    ]);
    expect(JSON.parse(lines[0] as string)[0].name).toBe("dev/v1.0");
    expect(JSON.parse(lines[1] as string)[0].sha).toBe("abcdef1");
    expect(JSON.parse(lines[2] as string)[0].path).toBe("src/index.ts");
  });

  test("sync --json queues through repos.syncRepo caller", async () => {
    const { run } = await import("./repos.ts");
    const caller = fakeCaller();
    const lines: string[] = [];

    await run(["sync", ROW.id, "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls[0]).toEqual(["syncRepo", { repoId: ROW.id }]);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      repoId: ROW.id,
      status: "queued",
    });
  });
});
