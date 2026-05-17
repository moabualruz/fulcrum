import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let repoId = "";
const fileDetails = new Map<string, FileDetailPayload>();
const repoFilesMock = ((globalThis as typeof globalThis & {
  __repoFilesMock?: Record<string, unknown>;
}).__repoFilesMock ??= {});

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-file-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
  repoId = makeId();
  fileDetails.clear();
  repoFilesMock["fileDetails"] = fileDetails;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

interface FileDetailPayload {
  repo: { id: string; slug: string };
  branch: string;
  filePath: string;
  mimeCategory: "image" | "text" | "binary";
  content: string | null;
  isBinary: boolean;
  showBlame: boolean;
  blame: Array<{ line_number: number; commit_sha: string; author: string }>;
}

function putFile(path: string, overrides: Partial<FileDetailPayload> = {}) {
  fileDetails.set(path, {
    repo: { id: repoId, slug: "my-repo" },
    branch: "main",
    filePath: path,
    mimeCategory: "text",
    content: null,
    isBinary: false,
    showBlame: false,
    blame: [],
    ...overrides,
  });
}

mock.module("@integration-hub/interface/repository-files.ts", () => ({
  loadRepositoryFilesPage: async () => ({ tree: [], filePath: "", fileContent: null, isBinary: false }),
  loadRepositoryFileDetail: async (
    _context: unknown,
    input: { branch?: string; filePath: string; showBlame: boolean },
  ) => {
    const sharedDetails = (repoFilesMock["fileDetails"] as Map<string, FileDetailPayload> | undefined) ?? fileDetails;
    const detail = sharedDetails.get(input.filePath);
    if (!detail) {
      const { AppNotFoundError } = await import("@platform-core/domain/errors.ts");
      throw new AppNotFoundError("File not found");
    }
    return {
      ...detail,
      branch: input.branch ?? detail.branch,
      showBlame: input.showBlame,
      blame: input.showBlame ? detail.blame : [],
    };
  },
  listRepositoryTreeChildren: async () => [],
}));

describe("/repos/[id]/files/[...path] +page.server.ts", () => {
  test("load returns file content for a text file", async () => {
    putFile("apps/cli/src/main.ts", { content: "const x = 1;" });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: repoId, path: "apps/cli/src/main.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/apps/cli/src/main.ts`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.filePath).toBe("apps/cli/src/main.ts");
    expect(payload.mimeCategory).toBe("text");
    expect(payload.content).toBe("const x = 1;");
    expect(payload.isBinary).toBe(false);
    expect(payload.showBlame).toBe(false);
    expect(payload.blame).toEqual([]);
  });

  test("load returns blame when ?blame=1", async () => {
    putFile("apps/cli/src/main.ts", {
      content: "line1\nline2",
      blame: [
        { line_number: 1, commit_sha: "abc1234", author: "alice" },
        { line_number: 2, commit_sha: "def5678", author: "bob" },
      ],
    });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({
      params: { id: repoId, path: "apps/cli/src/main.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/apps/cli/src/main.ts?blame=1`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.showBlame).toBe(true);
    expect(payload.blame.length).toBe(2);
    expect(payload.blame[0]!.commit_sha).toBe("abc1234");
    expect(payload.blame[1]!.author).toBe("bob");
  });

  test("load returns binary flag for binary file", async () => {
    putFile("data.bin", { mimeCategory: "binary", isBinary: true });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const result = await mod.load({
      params: { id: repoId, path: "data.bin" },
      url: new URL(`http://localhost/repos/${repoId}/files/data.bin`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.isBinary).toBe(true);
    expect(payload.mimeCategory).toBe("binary");
    expect(payload.content).toBeNull();
  });

  test("load throws 404 for nonexistent file", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    let caught: unknown;
    try {
      const result = await mod.load({
        params: { id: repoId, path: "nope.ts" },
        url: new URL(`http://localhost/repos/${repoId}/files/nope.ts`),
      } as Parameters<typeof mod.load>[0]);
      await streamedData<FileDetailPayload>(result);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });

  test("load supports branch param for blame", async () => {
    putFile("dev.ts", {
      branch: "dev",
      content: "dev line",
      blame: [{ line_number: 1, commit_sha: "devsha1", author: "carol" }],
    });

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 4}`);
    const result = await mod.load({
      params: { id: repoId, path: "dev.ts" },
      url: new URL(`http://localhost/repos/${repoId}/files/dev.ts?branch=dev&blame=1`),
    } as Parameters<typeof mod.load>[0]);

    const payload = await streamedData<FileDetailPayload>(result);
    expect(payload.branch).toBe("dev");
    expect(payload.showBlame).toBe(true);
    expect(payload.blame.length).toBe(1);
    expect(payload.blame[0]!.author).toBe("carol");
  });
});
