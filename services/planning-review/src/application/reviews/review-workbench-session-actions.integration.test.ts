import { describe, expect, test } from "bun:test";

import { createTestOrm } from "@test-support/application-database.ts";
import type { CodeReviewAnnotation } from "@planning-review/application/reviews/shared/review-feedback.ts";
import {
  appendReviewWorkbenchAnnotation,
  loadReviewWorkbenchSession,
  saveReviewWorkbenchSession,
} from "@planning-review/application/reviews/review-workbench-session-actions.ts";
import type { ReviewWorkbenchDiffFile } from "@planning-review/application/reviews/review-workbench.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

const files: ReviewWorkbenchDiffFile[] = [
  {
    path: "src/review/app.ts",
    patch: [
      "diff --git a/src/review/app.ts b/src/review/app.ts",
      "@@ -1,2 +1,3 @@",
      "-const trace = oldTrace;",
      "+const trace = acceptedTrace;",
      "+console.log(trace);",
    ].join("\n"),
    additions: 2,
    deletions: 1,
  },
  {
    path: "docs/review-plan.md",
    patch: "@@ -1 +1 @@\n+Trace acceptance criteria",
    additions: 1,
    deletions: 0,
  },
];

const annotations: CodeReviewAnnotation[] = [
  {
    id: "ann-session-file",
    type: "concern",
    scope: "file",
    filePath: "src/review/app.ts",
    lineStart: 1,
    lineEnd: 1,
    side: "new",
    text: "Persist this blocking review note.",
    decorations: ["blocking"],
    createdAt: 1,
  },
  {
    id: "ann-session-suggestion",
    type: "suggestion",
    filePath: "src/review/app.ts",
    lineStart: 1,
    lineEnd: 1,
    side: "new",
    text: "Use the accepted trace helper.",
    originalCode: "const trace = oldTrace;",
    suggestedCode: "const trace = acceptedTrace;",
    createdAt: 2,
  },
];

describe("persisted review workbench review workbench sessions", () => {
  test("saves versioned trace-linked review state and reloads latest workbench model", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProject(em);

      const saved = await saveReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-review-session",
        reviewId: "review-session-1",
        reviewType: "code_review",
        title: "Code review session",
        files,
        annotations,
        searchQuery: "trace",
        selectedFilePath: "src/review/app.ts",
        viewedFilePaths: ["docs/review-plan.md"],
        liveLog: { content: "review boot\ntrace ready", isLive: false },
      });

      expect(saved).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-review-session",
        reviewId: "review-session-1",
        reviewType: "code_review",
        title: "Code review session",
        status: "saved",
        revision: 1,
      });
      expect(saved.model.summary).toMatchObject({
        fileCount: 2,
        annotationCount: 2,
        blockingAnnotationCount: 1,
        suggestionCount: 1,
        searchMatchCount: 6,
      });

      await saveReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-review-session",
        reviewId: "review-session-1",
        reviewType: "code_review",
        title: "Code review session",
        files,
        annotations: annotations.slice(0, 1),
        searchQuery: "criteria",
        viewedFilePaths: ["src/review/app.ts"],
        hideViewedFiles: true,
        liveLog: { content: "latest review output", isLive: true },
      });

      const loaded = await loadReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        reviewId: "review-session-1",
      });

      expect(loaded).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-review-session",
        reviewId: "review-session-1",
        status: "loaded",
        revision: 2,
      });
      expect(loaded.model.visibleFiles.map((file) => file.path)).toEqual(["docs/review-plan.md"]);
      expect(loaded.model.summary).toMatchObject({
        annotationCount: 1,
        viewedFileCount: 1,
        visibleFileCount: 1,
        hasLiveOutput: true,
      });
      expect(loaded.model.search.query).toBe("criteria");
      expect(loaded.model.liveLog.displayText).toBe("latest review output");

      const traceLoaded = await loadReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-review-session",
        searchQuery: "accepted",
        viewedFilePaths: [],
        hideViewedFiles: false,
      });
      expect(traceLoaded.reviewId).toBe("review-session-1");
      expect(traceLoaded.model.search.query).toBe("accepted");
      expect(traceLoaded.model.visibleFiles.map((file) => file.path)).toEqual(["src/review/app.ts", "docs/review-plan.md"]);

      const events = await em.getConnection().execute<Array<{
        verb: string;
        subject_kind: string;
        subject_id: string;
        payload: Record<string, unknown>;
      }>>(
        `select verb, subject_kind, subject_id, payload
           from events
          where org_id = ?
            and project_id = ?
            and subject_kind = 'review_session'
            and subject_id = ?
          order by (payload->>'revision')::int asc`,
        [ORG_ID, PROJECT_ID, "review-session-1"],
      );
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        verb: "review_session_saved",
        subject_kind: "review_session",
        subject_id: "review-session-1",
        payload: expect.objectContaining({
          traceId: "trace-review-session",
          reviewId: "review-session-1",
          reviewType: "code_review",
          revision: 2,
          fileCount: 2,
          annotationCount: 1,
        }),
      });
    } finally {
      await db.close();
    }
  });

  test("appends an inline annotation as a new persisted review-session revision", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const ctx = { orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID };
      await seedProject(em);

      await saveReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        traceId: "trace-review-annotation",
        reviewId: "review-annotation-1",
        reviewType: "code_review",
        title: "Annotation review session",
        files,
        annotations: [],
        searchQuery: "accepted",
        selectedFilePath: "src/review/app.ts",
      });

      const annotated = await appendReviewWorkbenchAnnotation(em, ctx, {
        projectId: PROJECT_ID,
        reviewId: "review-annotation-1",
        annotationId: "ann-inline-added",
        type: "suggestion",
        filePath: "src/review/app.ts",
        lineStart: 1,
        lineEnd: 2,
        side: "new",
        text: "Inline review feedback should persist with the session.",
        originalCode: "const trace = oldTrace;",
        suggestedCode: "const trace = acceptedTrace;",
        searchQuery: "feedback",
      });

      expect(annotated).toMatchObject({
        projectId: PROJECT_ID,
        traceId: "trace-review-annotation",
        reviewId: "review-annotation-1",
        reviewType: "code_review",
        status: "annotated",
        revision: 2,
      });
      expect(annotated.model.summary).toMatchObject({
        annotationCount: 1,
        suggestionCount: 1,
      });
      expect(annotated.model.annotationGroups[0]?.annotations[0]).toMatchObject({
        id: "ann-inline-added",
        filePath: "src/review/app.ts",
        lineStart: 1,
        lineEnd: 2,
        text: "Inline review feedback should persist with the session.",
        suggestedCode: "const trace = acceptedTrace;",
      });
      expect(annotated.model.search.query).toBe("feedback");

      const loaded = await loadReviewWorkbenchSession(em, ctx, {
        projectId: PROJECT_ID,
        reviewId: "review-annotation-1",
      });
      expect(loaded.revision).toBe(2);
      expect(loaded.model.summary.annotationCount).toBe(1);
      expect(loaded.model.annotationGroups[0]?.annotations[0]?.id).toBe("ann-inline-added");

      const events = await em.getConnection().execute<Array<{ verb: string; payload: Record<string, unknown> }>>(
        `select verb, payload
           from events
          where org_id = ?
            and project_id = ?
            and subject_kind = 'review_session'
            and subject_id = ?
          order by (payload->>'revision')::int asc`,
        [ORG_ID, PROJECT_ID, "review-annotation-1"],
      );
      expect(events.map((event) => event.verb)).toEqual(["review_session_saved", "review_session_annotation_added"]);
      expect(events[1]?.payload).toMatchObject({
        revision: 2,
        annotationCount: 1,
        addedAnnotationId: "ann-inline-added",
      });
    } finally {
      await db.close();
    }
  });
});

async function seedProject(em: Awaited<ReturnType<typeof createTestOrm>>["em"]): Promise<void> {
  await em.getConnection().execute(
    `insert into projects (id, org_id, name) values (?, ?, ?)`,
    [PROJECT_ID, ORG_ID, "Review Workbench Session Project"],
  );
}
