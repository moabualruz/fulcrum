import { afterEach, describe, expect, it } from "bun:test";

import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import type { EntityManager } from "@mikro-orm/postgresql";

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

async function setup(): Promise<{ db: TestOrm; em: EntityManager; org: Org }> {
  db = await createTestOrm();
  const em = db.orm.em.fork();
  const org = await em.findOneOrFail(Org, { id: db.seed.orgId });
  return { db, em, org };
}

describe("connector domain MikroORM entities", () => {
  it("persists and reloads BitbucketPullRequest and BitbucketIssue with org/project FKs", async () => {
    const { em, org } = await setup();

    const pullRequest = em.create(BitbucketPullRequest, {
      org,
      projectId: "project-alpha",
      repoSlug: "fulcrum",
      pullRequestId: "bb-pr-42",
      title: "Ship application authority",
      state: "open",
      url: "https://bitbucket.example/pr/42",
      payload: { source: "branch-a" },
    });
    const issue = em.create(BitbucketIssue, {
      org,
      projectId: "project-alpha",
      repoSlug: "fulcrum",
      issueId: "bb-issue-7",
      title: "Schema authority gap",
      state: "open",
      url: "https://bitbucket.example/issues/7",
      payload: { priority: "high" },
    });

    em.persist([pullRequest, issue]);
    await em.flush();
    em.clear();

    const reloadedPr = await em.findOneOrFail(BitbucketPullRequest, {
      pullRequestId: "bb-pr-42",
    }, { populate: ["org"] });
    const reloadedIssue = await em.findOneOrFail(BitbucketIssue, {
      issueId: "bb-issue-7",
    }, { populate: ["org"] });

    expect(reloadedPr.org.id).toBe(org.id);
    expect(reloadedPr.projectId).toBe("project-alpha");
    expect(reloadedIssue.org.id).toBe(org.id);
    expect(reloadedIssue.projectId).toBe("project-alpha");
  });

  it("persists and reloads GitlabMergeRequest and GitlabIssue with org/project FKs", async () => {
    const { em, org } = await setup();

    const mergeRequest = em.create(GitlabMergeRequest, {
      org,
      projectId: "project-beta",
      repoPath: "group/fulcrum",
      mergeRequestIid: "12",
      title: "Replace legacy SQL",
      state: "opened",
      url: "https://gitlab.example/group/fulcrum/-/merge_requests/12",
      payload: { targetBranch: "main" },
    });
    const issue = em.create(GitlabIssue, {
      org,
      projectId: "project-beta",
      repoPath: "group/fulcrum",
      issueIid: "33",
      title: "Outbox missing",
      state: "opened",
      url: "https://gitlab.example/group/fulcrum/-/issues/33",
      payload: { labels: ["architecture"] },
    });

    em.persist([mergeRequest, issue]);
    await em.flush();
    em.clear();

    const reloadedMr = await em.findOneOrFail(GitlabMergeRequest, {
      mergeRequestIid: "12",
    }, { populate: ["org"] });
    const reloadedIssue = await em.findOneOrFail(GitlabIssue, {
      issueIid: "33",
    }, { populate: ["org"] });

    expect(reloadedMr.org.id).toBe(org.id);
    expect(reloadedMr.projectId).toBe("project-beta");
    expect(reloadedIssue.org.id).toBe(org.id);
    expect(reloadedIssue.projectId).toBe("project-beta");
  });

  it("persists and reloads GithubConnectorState with org/project FKs", async () => {
    const { em, org } = await setup();

    const state = em.create(GithubConnectorState, {
      org,
      projectId: "project-gamma",
      installationId: "installation-9",
      repoFullName: "moabualruz/fulcrum",
      cursor: "cursor-1",
      payload: { permissions: ["pull_requests"] },
    });

    em.persist(state);
    await em.flush();
    em.clear();

    const reloaded = await em.findOneOrFail(GithubConnectorState, {
      installationId: "installation-9",
    }, { populate: ["org"] });

    expect(reloaded.org.id).toBe(org.id);
    expect(reloaded.projectId).toBe("project-gamma");
  });
});
