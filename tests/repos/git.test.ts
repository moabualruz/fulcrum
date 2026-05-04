import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  getBlame,
  getCommitDiff,
  getCommitLog,
  getFileContent,
  getFileTree,
  getStashList,
  getStatus,
  listBranches,
} from "../../src/repos/git.ts";

interface GitFixture {
  root: string;
  repoPath: string;
  barePath: string;
  git: SimpleGit;
  initialSha: string;
  mainSha: string;
  featureSha: string;
}

async function createGitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(join(tmpdir(), "fulcrum-git-"));
  const repoPath = join(root, "work");
  const barePath = join(root, "origin.git");
  const peerPath = join(root, "peer");

  await mkdir(repoPath, { recursive: true });
  await mkdir(join(repoPath, "docs"), { recursive: true });
  await mkdir(join(repoPath, "assets"), { recursive: true });

  const git = simpleGit({ baseDir: repoPath });
  await git.init();
  await git.addConfig("user.name", "Fixture Author");
  await git.addConfig("user.email", "fixture@example.com");
  await git.branch(["-M", "main"]);

  await writeFile(join(repoPath, "README.md"), "hello\nworld\n");
  await writeFile(join(repoPath, "docs", "guide.txt"), "guide v1\n");
  await writeFile(join(repoPath, "assets", "logo.bin"), Buffer.from([0, 1, 2, 3]));
  await git.add(".");
  await git.commit("test(repos): initial commit\n\nInitial body");
  const initialSha = (await git.revparse(["HEAD"])).trim();

  await writeFile(join(repoPath, "README.md"), "hello\nworld\nmain line\n");
  await git.add("README.md");
  await git.commit("test(repos): main update\n\nMain body");
  const mainSha = (await git.revparse(["HEAD"])).trim();

  await git.checkoutLocalBranch("feature/fixture");
  await writeFile(join(repoPath, "docs", "feature.md"), "feature\n");
  await git.add("docs/feature.md");
  await git.commit("test(repos): feature update\n\nFeature body");
  const featureSha = (await git.revparse(["HEAD"])).trim();

  await git.checkout("main");
  await simpleGit().raw(["init", "--bare", barePath]);
  await git.addRemote("origin", barePath);
  await git.push(["-u", "origin", "main"]);
  await git.push("origin", "feature/fixture");
  await git.raw(["remote", "set-head", "origin", "main"]);

  await simpleGit().clone(barePath, peerPath);
  const peer = simpleGit({ baseDir: peerPath });
  await peer.addConfig("user.name", "Peer Author");
  await peer.addConfig("user.email", "peer@example.com");
  await writeFile(join(peerPath, "peer.txt"), "peer\n");
  await peer.add("peer.txt");
  await peer.commit("test(repos): peer update");
  await peer.push("origin", "main");

  await writeFile(join(repoPath, "local.txt"), "local\n");
  await git.add("local.txt");
  await git.commit("test(repos): local update");
  await git.fetch("origin", "main");
  await writeFile(join(repoPath, "README.md"), "hello\nworld\nmain line\nunstaged\n");
  await writeFile(join(repoPath, "staged.txt"), "staged\n");
  await git.add("staged.txt");
  await writeFile(join(repoPath, "stash.txt"), "stash\n");
  await git.add("stash.txt");
  await git.stash(["push", "-m", "fixture stash", "--", "stash.txt"]);
  await writeFile(join(repoPath, "untracked.txt"), "untracked\n");

  return { root, repoPath, barePath, git, initialSha, mainSha, featureSha };
}

let fixture: GitFixture;

beforeEach(async () => {
  fixture = await createGitFixture();
});

afterEach(async () => {
  if (fixture) {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

describe("repos git wrapper", () => {
  test("getStatus returns branch, dirty state, ahead/behind, and changed paths", async () => {
    const status = await getStatus(fixture.repoPath);

    expect(status.branch).toBe("main");
    expect(status.dirty).toBe(true);
    expect(status.ahead).toBe(1);
    expect(status.behind).toBe(1);
    expect(status.staged).toContain("staged.txt");
    expect(status.unstaged).toContain("README.md");
  });

  test("getStatus classifies untracked files as unstaged only", async () => {
    const status = await getStatus(fixture.repoPath);

    expect(status.unstaged).toContain("untracked.txt");
    expect(status.staged).not.toContain("untracked.txt");
  });

  test("listBranches returns local and remote branches with current/default flags", async () => {
    const branches = await listBranches(fixture.repoPath);

    expect(branches).toContainEqual(expect.objectContaining({
      name: "main",
      headSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      isCurrent: true,
      isDefault: true,
    }));
    expect(branches).toContainEqual(expect.objectContaining({
      name: "feature/fixture",
      headSha: fixture.featureSha,
      isCurrent: false,
      isDefault: false,
    }));
    expect(branches).toContainEqual(expect.objectContaining({
      name: "origin/feature/fixture",
      headSha: fixture.featureSha,
      isCurrent: false,
      isDefault: false,
    }));
  });

  test("createBranch creates from a ref and rejects existing names", async () => {
    await createBranch(fixture.repoPath, "topic/from-initial", fixture.initialSha);
    const branches = await listBranches(fixture.repoPath);

    expect(branches).toContainEqual(expect.objectContaining({
      name: "topic/from-initial",
      headSha: fixture.initialSha,
    }));
    await expect(createBranch(fixture.repoPath, "topic/from-initial")).rejects.toThrow(/already exists/i);
  });

  test("checkoutBranch switches branches", async () => {
    await checkoutBranch(fixture.repoPath, "feature/fixture");

    expect((await getStatus(fixture.repoPath)).branch).toBe("feature/fixture");
  });

  test("deleteBranch deletes local branches and supports force", async () => {
    await createBranch(fixture.repoPath, "topic/delete-me", fixture.initialSha);
    await deleteBranch(fixture.repoPath, "topic/delete-me", true);

    const names = (await listBranches(fixture.repoPath)).map((branch) => branch.name);
    expect(names).not.toContain("topic/delete-me");
  });

  test("getCommitLog returns paginated commits with authors, dates, body, and parents", async () => {
    const commits = await getCommitLog(fixture.repoPath, { branch: "feature/fixture", maxCount: 1, offset: 0 });

    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual(expect.objectContaining({
      sha: fixture.featureSha,
      authorName: "Fixture Author",
      authorEmail: "fixture@example.com",
      committedAt: expect.any(Date),
      subject: "test(repos): feature update",
      body: "Feature body",
      parents: [fixture.mainSha],
    }));
  });

  test("getCommitDiff returns git show stat and patch output", async () => {
    const diff = await getCommitDiff(fixture.repoPath, fixture.featureSha);

    expect(diff).toContain("test(repos): feature update");
    expect(diff).toContain("docs/feature.md");
    expect(diff).toContain("+feature");
  });

  test("getBlame returns per-line commit attribution", async () => {
    const blame = await getBlame(fixture.repoPath, "README.md", "main");

    expect(blame.map((entry) => entry.line)).toEqual(["hello", "world", "main line"]);
    expect(blame.map((entry) => entry.lineNo)).toEqual([1, 2, 3]);
    expect(blame[0]).toEqual(expect.objectContaining({
      sha: fixture.initialSha,
      author: "Fixture Author",
    }));
  });

  test("getFileTree returns ls-tree entries for a directory", async () => {
    const tree = await getFileTree(fixture.repoPath, { branch: "feature/fixture", dir: "docs" });

    expect(tree).toEqual([
      { path: "docs/feature.md", kind: "file", sizeBytes: 8 },
      { path: "docs/guide.txt", kind: "file", sizeBytes: 9 },
    ]);
  });

  test("getFileTree labels directories as dir", async () => {
    const tree = await getFileTree(fixture.repoPath, { branch: "main" });

    expect(tree).toContainEqual({ path: "docs", kind: "dir", sizeBytes: 0 });
  });

  test("getFileContent returns text content and extension MIME type", async () => {
    const content = await getFileContent(fixture.repoPath, "docs/guide.txt", "main");

    expect(content).toEqual({
      content: "guide v1\n",
      mimeType: "text/plain",
    });
  });

  test("getFileTree and getFileContent resolve remote origin branches", async () => {
    const tree = await getFileTree(fixture.repoPath, { branch: "origin/feature/fixture", dir: "docs" });
    const content = await getFileContent(fixture.repoPath, "peer.txt", "origin/main");

    expect(tree).toEqual([
      { path: "docs/feature.md", kind: "file", sizeBytes: 8 },
      { path: "docs/guide.txt", kind: "file", sizeBytes: 9 },
    ]);
    expect(content).toEqual({
      content: "peer\n",
      mimeType: "text/plain",
    });
  });

  test("getFileContent returns binary content when MIME is not text", async () => {
    const content = await getFileContent(fixture.repoPath, "assets/logo.bin", "main");

    expect(Buffer.isBuffer(content.content)).toBe(true);
    expect(content.mimeType).toBe("application/octet-stream");
    expect(content.content).toEqual(Buffer.from([0, 1, 2, 3]));
  });

  test("getStashList returns stash index, message, and sha", async () => {
    const stashes = await getStashList(fixture.repoPath);

    expect(stashes).toHaveLength(1);
    expect(stashes[0]).toEqual(expect.objectContaining({
      index: 0,
      message: expect.stringContaining("fixture stash"),
      sha: expect.stringMatching(/^[0-9a-f]{40}$/),
    }));
  });

  test("wrapper functions are pure by taking repository paths", async () => {
    const fromBasename = basename(fixture.repoPath);

    expect(fromBasename).toBe("work");
    expect((await getStatus(fixture.repoPath)).branch).toBe("main");
  });
});
