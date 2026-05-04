import { describe, expect, it } from "bun:test";

interface RepoItem {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
  currentBranch: string | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  lastTouchedAt: Date | null;
  archived: boolean;
}

const ALPHA: RepoItem = {
  id: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-0000-0000-000000000001",
  name: "Alpha",
  slug: "alpha",
  kind: "local",
  localPath: "/work/alpha",
  remoteUrl: null,
  defaultBranch: "main",
  currentBranch: "main",
  lastSyncAt: null,
  syncStatus: "idle",
  lastTouchedAt: null,
  archived: false,
};

function fakeReposCaller(repos: RepoItem[] = [ALPHA]) {
  const calls: unknown[] = [];
  let state = [...repos];

  return {
    calls,
    repos: {
      register: async (input: unknown) => {
        calls.push(["register", input]);
        const repo = {
          ...ALPHA,
          id: "00000000-0000-4000-8000-000000000002",
          name: input && typeof input === "object" && "name" in input && typeof input.name === "string"
            ? input.name
            : "Registered",
          slug: "registered",
          kind: input && typeof input === "object" && "kind" in input && input.kind === "remote" ? "remote" : "local",
          localPath: input && typeof input === "object" && "path" in input && typeof input.path === "string" ? input.path : null,
          remoteUrl: input && typeof input === "object" && "url" in input && typeof input.url === "string" ? input.url : null,
        } satisfies RepoItem;
        state = [...state, repo];
        return repo;
      },
      list: async (input?: unknown) => {
        calls.push(["list", input]);
        return state.filter((repo) => !repo.archived);
      },
      get: async (input: { id: string }) => {
        calls.push(["get", input]);
        return state.find((repo) => repo.id === input.id) ?? null;
      },
      sync: async (input: { id: string }) => {
        calls.push(["sync", input]);
        const repo = state.find((item) => item.id === input.id);
        return repo ? { ...repo, syncStatus: "syncing" } : null;
      },
      unregister: async (input: { id: string }) => {
        calls.push(["unregister", input]);
        const repo = state.find((item) => item.id === input.id);
        return repo ? { ...repo, archived: true } : null;
      },
    },
  };
}

describe("repos.run", () => {
  it("registers local repos with --path and prints JSON", async () => {
    const { run } = await import("../../src/cli/commands/repos.ts");
    const caller = fakeReposCaller();
    const lines: string[] = [];

    await run(["register", "--path", "/work/alpha", "--name", "Alpha", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls[0]).toEqual(["register", {
      kind: "local",
      path: "/work/alpha",
      name: "Alpha",
    }]);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      name: "Alpha",
      kind: "local",
      localPath: "/work/alpha",
    });
  });

  it("registers remote repos with --url", async () => {
    const { run } = await import("../../src/cli/commands/repos.ts");
    const caller = fakeReposCaller();

    await run(["register", "--url", "https://example.test/alpha.git", "--slug", "alpha"], {
      caller,
      print: () => {},
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls[0]).toEqual(["register", {
      kind: "remote",
      url: "https://example.test/alpha.git",
      slug: "alpha",
    }]);
  });

  it("lists repos as JSON", async () => {
    const { run } = await import("../../src/cli/commands/repos.ts");
    const lines: string[] = [];

    await run(["list", "--json"], {
      caller: fakeReposCaller(),
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    const parsed = JSON.parse(lines[0] as string) as RepoItem[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.slug).toBe("alpha");
  });

  it("sync, unregister, and status call matching tRPC procedures", async () => {
    const { run } = await import("../../src/cli/commands/repos.ts");
    const caller = fakeReposCaller();
    const lines: string[] = [];

    await run(["sync", ALPHA.id, "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });
    await run(["unregister", ALPHA.id, "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });
    await run(["status", ALPHA.id, "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(caller.calls.slice(0, 3)).toEqual([
      ["sync", { id: ALPHA.id }],
      ["unregister", { id: ALPHA.id }],
      ["get", { id: ALPHA.id }],
    ]);
    expect(JSON.parse(lines[0] as string).syncStatus).toBe("syncing");
    expect(JSON.parse(lines[1] as string).archived).toBe(true);
    expect(JSON.parse(lines[2] as string)).toMatchObject({
      id: ALPHA.id,
      syncStatus: "idle",
    });
  });

  it("unknown repo id exits 1", async () => {
    const { run } = await import("../../src/cli/commands/repos.ts");
    let exitCode: number | undefined;
    const errors: string[] = [];

    await run(["status", "00000000-0000-4000-8000-000000009999"], {
      caller: fakeReposCaller(),
      print: () => {},
      printErr: (line) => errors.push(line),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("repo not found");
  });
});
