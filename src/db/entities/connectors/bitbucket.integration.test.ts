import { afterEach, describe, expect, it } from "bun:test";

import { createTestOrm, type TestOrm } from "../../../test-utils/db.ts";
import { Org } from "../auth/Org.ts";
import {
  BitbucketIssue,
  BitbucketPullRequest,
  GithubConnectorState,
  GitlabIssue,
  GitlabMergeRequest,
} from "./index.ts";

let db: TestOrm | undefined;

afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function setup(): Promise<{ db: TestOrm; org: Org }> {
  db = await createTestOrm();
  const org = await db.em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, org };
}

describe("connector domain MikroORM entities", () => {
  it("persists and reloads BitbucketPullRequest and BitbucketIssue with org/project FKs", async () => {
    const { db, org } = await setup();

    const pullRequest = db.em.create(BitbucketPullRequest, {
      org,
      projectId: "project-alpha",
      repoSlug: "fulcrum",
      pullRequestId: "bb-pr-42",
      title: "Ship application authority",
      state: "open",
      url: "https://bitbucket.example/pr/42",
      payload: { source: "branch-a" },
    });
    const issue = db.em.create(BitbucketIssue, {
      org,
      projectId: "project-alpha",
      repoSlug: "fulcrum",
      issueId: "bb-issue-7",
      title: "Schema authority gap",
      state: "open",
      url: "https://bitbucket.example/issues/7",
      payload: { priority: "high" },
    });

    await db.em.persistAndFlush([pullRequest, issue]);
    db.em.clear();

    const reloadedPr = await db.em.findOneOrFail(BitbucketPullRequest, {
      pullRequestId: "bb-pr-42",
    }, { populate: ["org"] });
    const reloadedIssue = await db.em.findOneOrFail(BitbucketIssue, {
      issueId: "bb-issue-7",
    }, { populate: ["org"] });

    expect(reloadedPr.org.id).toBe(org.id);
    expect(reloadedPr.projectId).toBe("project-alpha");
    expect(reloadedIssue.org.id).toBe(org.id);
    expect(reloadedIssue.projectId).toBe("project-alpha");
  });

  it("persists and reloads GitlabMergeRequest and GitlabIssue with org/project FKs", async () => {
    const { db, org } = await setup();

    const mergeRequest = db.em.create(GitlabMergeRequest, {
      org,
      projectId: "project-beta",
      repoPath: "group/fulcrum",
      mergeRequestIid: "12",
      title: "Replace legacy SQL",
      state: "opened",
      url: "https://gitlab.example/group/fulcrum/-/merge_requests/12",
      payload: { targetBranch: "main" },
    });
    const issue = db.em.create(GitlabIssue, {
      org,
      projectId: "project-beta",
      repoPath: "group/fulcrum",
      issueIid: "33",
      title: "Outbox missing",
      state: "opened",
      url: "https://gitlab.example/group/fulcrum/-/issues/33",
      payload: { labels: ["architecture"] },
    });

    await db.em.persistAndFlush([mergeRequest, issue]);
    db.em.clear();

    const reloadedMr = await db.em.findOneOrFail(GitlabMergeRequest, {
      mergeRequestIid: "12",
    }, { populate: ["org"] });
    const reloadedIssue = await db.em.findOneOrFail(GitlabIssue, {
      issueIid: "33",
    }, { populate: ["org"] });

    expect(reloadedMr.org.id).toBe(org.id);
    expect(reloadedMr.projectId).toBe("project-beta");
    expect(reloadedIssue.org.id).toBe(org.id);
    expect(reloadedIssue.projectId).toBe("project-beta");
  });

  it("persists and reloads GithubConnectorState with org/project FKs", async () => {
    const { db, org } = await setup();

    const state = db.em.create(GithubConnectorState, {
      org,
      projectId: "project-gamma",
      installationId: "installation-9",
      repoFullName: "moabualruz/fulcrum",
      cursor: "cursor-1",
      payload: { permissions: ["pull_requests"] },
    });

    await db.em.persistAndFlush(state);
    db.em.clear();

    const reloaded = await db.em.findOneOrFail(GithubConnectorState, {
      installationId: "installation-9",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-gamma");
  });
});
