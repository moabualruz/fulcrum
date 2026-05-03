import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "better-auth";

import { Document } from "../../src/db/entities/docs/Document.ts";
import { configureDocNarrator } from "../../src/docs/llm-narrator.ts";
import { createTestOrm } from "../../src/test-utils/db.ts";
import { createContext } from "../../src/trpc/context.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { t } from "../../src/trpc/trpc.ts";

type TipTapNode = { type?: string; attrs?: { readonly?: boolean }; content?: TipTapNode[] };
type TipTapDoc = { type?: string; content?: TipTapNode[] };

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

function mockSession(userId: string, orgId: string): Session {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  } as unknown as Session;
}

function callerFor(em: import("@mikro-orm/postgresql").EntityManager) {
  return createCaller(
    createContext({
      session: mockSession(USER_ID, ORG_ID),
      orgId: ORG_ID,
      userId: USER_ID,
      em,
      container: null,
    }),
  );
}

describe("docs.update LLM narration gate", () => {
  let previousFeatures: string | undefined;

  beforeEach(() => {
    previousFeatures = process.env["FULCRUM_FEATURES"];
  });

  afterEach(() => {
    if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = previousFeatures;
    configureDocNarrator({ client: null });
  });

  test("flag ON stores summary in content_json and body_md for ADR saves", async () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const generate = mock(async () => ({
      text: "First executive paragraph.\n\nSecond executive paragraph.",
      model: "test",
      tokens: 12,
    }));
    configureDocNarrator({ client: { generate } });

    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const created = await caller.docs.create({
        title: "Narrated ADR",
        docType: "adr",
        bodyMd: "# Decision\n\nUse sidecar summaries.",
      });

      const updated = await caller.docs.update({
        id: created.id,
        bodyMd: "# Decision\n\nUse sidecar summaries.",
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Use sidecar summaries." }] }],
        },
      });

      expect(generate).toHaveBeenCalledTimes(1);
      const updatedContent = updated?.contentJson as TipTapDoc | undefined;
      expect(updatedContent?.content?.[0]).toMatchObject({
        type: "narration-block",
        attrs: { readonly: true },
      });
      expect(updated?.bodyMd).toStartWith(
        "> [AI Summary]\n>\n> First executive paragraph.\n>\n> Second executive paragraph.\n\n---\n\n",
      );

      const stored = await em.findOneOrFail(Document, { id: created.id });
      expect(stored.bodyMd).toBe(updated?.bodyMd ?? "");
    } finally {
      await db.close();
    }
  });

  test("flag OFF never calls sidecar for eligible docs", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const generate = mock(async () => ({ text: "one\n\ntwo", model: "test", tokens: 8 }));
    configureDocNarrator({ client: { generate } });

    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const caller = callerFor(em);
      const created = await caller.docs.create({ title: "Plain ADR", docType: "adr", bodyMd: "Body" });
      const updated = await caller.docs.update({ id: created.id, bodyMd: "Updated body" });

      expect(generate).not.toHaveBeenCalled();
      expect(updated?.bodyMd).toBe("Updated body");
      const updatedContent = updated?.contentJson as TipTapDoc | undefined;
      expect(updatedContent?.content?.[0]?.type).not.toBe("narration-block");
    } finally {
      await db.close();
    }
  });
});
