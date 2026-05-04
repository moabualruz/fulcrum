/**
 * Tests: docs.templates tRPC router + CLI + web + TUI surfaces.
 * P7-04: Doc template seeds — 9 org-default templates + project-override precedence.
 *
 * RED first per TDD discipline.
 */

import { Container } from "@needle-di/core";
import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { createContext } from "../../../../trpc/context.ts";
import { appRouter } from "../../../../trpc/router.ts";
import { t } from "../../../../trpc/trpc.ts";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
  type DocTemplateRow,
  type DocTemplateService,
} from "../../../../docs/doc-template-service.ts";
import { run as runDocsTemplateCli } from "../../../../cli/docs-templates.ts";
import { TuiApp } from "../../../../tui/index.ts";
import { FakeTTY } from "../../../../tui/testing/fake-tty.ts";
import { TEMPLATE_BODY_MAP, TEMPLATE_SEEDS } from "../../../../docs/template-seeds.ts";
import { createTestOrm } from "../../../../test-utils/db.ts";
import { DEFAULT_ORG_ID as SEEDED_ORG_ID } from "../../../../db/seed.ts";
import { EntityManagerDocTemplateService } from "../../../../docs/em-doc-template-service.ts";
import { Org } from "../../../../db/entities/auth/Org.ts";
import { DocTemplate } from "../../../../db/entities/docs/DocTemplate.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

const DOC_TYPES = [
  "spec",
  "adr",
  "wiki",
  "runbook",
  "meeting",
  "postmortem",
  "rfc",
  "note",
  "scratch",
] as const;

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeOrgTemplates(): DocTemplateRow[] {
  return DOC_TYPES.map((docType, i) => ({
    id: `tmpl-${String(i).padStart(2, "0")}`,
    orgId: DEFAULT_ORG_ID,
    projectId: null,
    docType,
    name: `Default ${docType}`,
    frontmatterTemplate: {},
    bodyTemplate: `## ${docType} default body`,
    isDefault: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }));
}

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const PROJECT_ADR: DocTemplateRow = {
  id: "tmpl-proj-adr",
  orgId: DEFAULT_ORG_ID,
  projectId: PROJECT_ID,
  docType: "adr",
  name: "Project ADR",
  frontmatterTemplate: { status: "proposed", project: "my-svc" },
  bodyTemplate: "## Project Context\n\n## Project Decision\n\n## Project Consequences",
  isDefault: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

// ─── Mock service ────────────────────────────────────────────────────────────

function makeService(templates: DocTemplateRow[]): DocTemplateService {
  return {
    async list(orgId, _projectId) {
      return templates.filter((t) => t.orgId === orgId);
    },
    async resolve(orgId, projectId, docType) {
      if (projectId) {
        const specific = templates.find(
          (t) =>
            t.orgId === orgId &&
            t.projectId === projectId &&
            t.docType === docType &&
            t.isDefault,
        );
        if (specific) return specific;
      }
      return (
        templates.find(
          (t) =>
            t.orgId === orgId &&
            t.projectId === null &&
            t.docType === docType &&
            t.isDefault,
        ) ?? null
      );
    },
  };
}

function makeContainer(service: DocTemplateService): Container {
  const container = new Container();
  container.bind({ provide: DOC_TEMPLATE_SERVICE_TOKEN, useValue: service });
  return container;
}

// ─── tRPC caller factory ──────────────────────────────────────────────────────

function mockSession(): Session {
  return {
    id: "session_1",
    userId: "user_1",
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  } as Session;
}

function createCaller(container: Container) {
  const factory = t.createCallerFactory(appRouter);
  return factory(
    createContext({
      session: mockSession(),
      orgId: DEFAULT_ORG_ID,
      userId: "user_1",
      em: null,
      container,
    }),
  );
}

// ─── tRPC tests ──────────────────────────────────────────────────────────────

describe("docs.templates tRPC router", () => {
  test("docs.templates.list returns exactly 9 templates for the default org", async () => {
    const caller = createCaller(makeContainer(makeService(makeOrgTemplates())));
    const result = await caller.docs.templates.list({});

    expect(result).toHaveLength(9);
    expect(result.map((r) => r.docType).sort()).toEqual([...DOC_TYPES].sort());
    expect(result.every((r) => r.orgId === DEFAULT_ORG_ID)).toBe(true);
    expect(result.every((r) => r.projectId === null)).toBe(true);
    expect(result.every((r) => r.isDefault === true)).toBe(true);
  });

  test("docs.templates.resolve returns project-specific template over org default", async () => {
    const all = [...makeOrgTemplates(), PROJECT_ADR];
    const caller = createCaller(makeContainer(makeService(all)));

    const projectResult = await caller.docs.templates.resolve({
      docType: "adr",
      projectId: PROJECT_ID,
    });
    expect(projectResult).not.toBeNull();
    expect(projectResult?.id).toBe(PROJECT_ADR.id);
    expect(projectResult?.projectId).toBe(PROJECT_ID);
    expect(projectResult?.bodyTemplate).toBe(PROJECT_ADR.bodyTemplate);

    const orgResult = await caller.docs.templates.resolve({
      docType: "adr",
      projectId: null,
    });
    expect(orgResult).not.toBeNull();
    expect(orgResult?.projectId).toBeNull();
    expect(orgResult?.docType).toBe("adr");
    expect(orgResult?.id).not.toBe(PROJECT_ADR.id);
  });

  test("docs.templates.resolve returns null when no template exists", async () => {
    const caller = createCaller(makeContainer(makeService([])));
    const result = await caller.docs.templates.resolve({
      docType: "note",
      projectId: null,
    });
    expect(result).toBeNull();
  });
});

// ─── Production service tests ───────────────────────────────────────────────

describe("EntityManagerDocTemplateService", () => {
  test("list(projectId) returns project templates plus static org-default fallback", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const org = em.getReference(Org, SEEDED_ORG_ID);
      em.persist(em.create(DocTemplate, {
        org,
        projectId: PROJECT_ID,
        docType: "adr",
        name: "Project ADR",
        frontmatterTemplate: { status: "proposed", project: "my-svc" },
        bodyTemplate: "## Project-only ADR",
        isDefault: true,
      }));
      await em.flush();

      const service = new EntityManagerDocTemplateService(em);
      const rows = await service.list(SEEDED_ORG_ID, PROJECT_ID);

      expect(rows).toHaveLength(10);
      expect(rows.filter((row) => row.projectId === null)).toHaveLength(9);
      expect(rows.some((row) => row.projectId === PROJECT_ID && row.docType === "adr")).toBe(true);
      expect(rows.find((row) => row.projectId === null && row.docType === "spec")?.bodyTemplate)
        .toContain("## Requirements");
    } finally {
      await db.close();
    }
  });

  test("resolve falls back to immutable built-in templates when no DB default exists", async () => {
    const db = await createTestOrm();
    try {
      const service = new EntityManagerDocTemplateService(db.em.fork());
      const template = await service.resolve(SEEDED_ORG_ID, null, "rfc");

      expect(template).not.toBeNull();
      expect(template?.id).toBe("builtin-doc-template-rfc");
      expect(template?.projectId).toBeNull();
      expect(template?.bodyTemplate).toContain("## Proposal");
    } finally {
      await db.close();
    }
  });
});

// ─── CLI tests ───────────────────────────────────────────────────────────────

describe("fulcrum docs template list CLI", () => {
  test("--json outputs all 9 templates with correct fields", async () => {
    const orgTemplates = makeOrgTemplates();
    const caller = createCaller(makeContainer(makeService(orgTemplates)));

    const lines: string[] = [];
    await runDocsTemplateCli(["list", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => undefined,
      exit: (code) => { throw new Error(`unexpected exit ${code}`); },
    });

    const parsed = JSON.parse(lines.join("\n")) as DocTemplateRow[];
    expect(parsed).toHaveLength(9);
    expect(parsed.map((r) => r.docType).sort()).toEqual([...DOC_TYPES].sort());
    expect(parsed.every((r) => typeof r.bodyTemplate === "string")).toBe(true);
    expect(parsed.every((r) => typeof r.frontmatterTemplate === "object")).toBe(true);
  });
});

// ─── Web tests ───────────────────────────────────────────────────────────────

describe("TEMPLATE_BODY_MAP (web new-doc wizard static data)", () => {
  test("covers all 9 doc_types", () => {
    const keys = Object.keys(TEMPLATE_BODY_MAP).sort();
    expect(keys).toEqual([...DOC_TYPES].sort());
  });

  test("each value is a non-empty string (or empty for scratch)", () => {
    for (const dt of DOC_TYPES) {
      const body = TEMPLATE_BODY_MAP[dt];
      expect(typeof body).toBe("string");
    }
    // Non-scratch types have actual content
    const nonEmpty = DOC_TYPES.filter((dt) => dt !== "scratch");
    for (const dt of nonEmpty) {
      expect(TEMPLATE_BODY_MAP[dt].length).toBeGreaterThan(0);
    }
  });

  test("ADR body includes required H2 sections", () => {
    const body = TEMPLATE_BODY_MAP["adr"];
    expect(body).toContain("## Context");
    expect(body).toContain("## Decision");
    expect(body).toContain("## Consequences");
  });

  test("postmortem body includes required H2 sections", () => {
    const body = TEMPLATE_BODY_MAP["postmortem"];
    expect(body).toContain("## Impact");
    expect(body).toContain("## Timeline");
    expect(body).toContain("## Root Cause");
    expect(body).toContain("## Action Items");
  });

  test("RFC body includes required H2 sections", () => {
    const body = TEMPLATE_BODY_MAP["rfc"];
    expect(body).toContain("## Summary");
    expect(body).toContain("## Motivation");
    expect(body).toContain("## Proposal");
    expect(body).toContain("## Alternatives");
  });

  test("runbook body includes required H2 sections", () => {
    const body = TEMPLATE_BODY_MAP["runbook"];
    expect(body).toContain("## Service");
    expect(body).toContain("## Severity");
    expect(body).toContain("## Steps");
    expect(body).toContain("## Escalation");
  });

  test("meeting body includes required H2 sections", () => {
    const body = TEMPLATE_BODY_MAP["meeting"];
    expect(body).toContain("## Attendees");
    expect(body).toContain("## Agenda");
    expect(body).toContain("## Notes");
    expect(body).toContain("## Action Items");
  });

  test("frontmatter keys match Zod schema required fields", () => {
    // ADR — status, decision, context, consequences
    const adr = TEMPLATE_SEEDS.find((s) => s.docType === "adr")!;
    expect(adr.frontmatterTemplate).toHaveProperty("status");
    expect(adr.frontmatterTemplate).toHaveProperty("decision");
    expect(adr.frontmatterTemplate).toHaveProperty("context");
    expect(adr.frontmatterTemplate).toHaveProperty("consequences");

    // postmortem — impact, timeline, root_cause, action_items
    const pm = TEMPLATE_SEEDS.find((s) => s.docType === "postmortem")!;
    expect(pm.frontmatterTemplate).toHaveProperty("impact");
    expect(pm.frontmatterTemplate).toHaveProperty("timeline");
    expect(pm.frontmatterTemplate).toHaveProperty("root_cause");
    expect(pm.frontmatterTemplate).toHaveProperty("action_items");

    // rfc — status, summary
    const rfc = TEMPLATE_SEEDS.find((s) => s.docType === "rfc")!;
    expect(rfc.frontmatterTemplate).toHaveProperty("status");
    expect(rfc.frontmatterTemplate).toHaveProperty("summary");

    // runbook — service, severity_level
    const runbook = TEMPLATE_SEEDS.find((s) => s.docType === "runbook")!;
    expect(runbook.frontmatterTemplate).toHaveProperty("service");
    expect(runbook.frontmatterTemplate).toHaveProperty("severity_level");

    // meeting — date, attendees
    const meeting = TEMPLATE_SEEDS.find((s) => s.docType === "meeting")!;
    expect(meeting.frontmatterTemplate).toHaveProperty("date");
    expect(meeting.frontmatterTemplate).toHaveProperty("attendees");

    // spec — status
    const spec = TEMPLATE_SEEDS.find((s) => s.docType === "spec")!;
    expect(spec.frontmatterTemplate).toHaveProperty("status");
  });
});

// ─── TUI tests ───────────────────────────────────────────────────────────────

describe("TUI new-doc flow", () => {
  test("pressing n from nav opens new-doc screen with template body visible", async () => {
    const orgTemplates = makeOrgTemplates();
    const tty = new FakeTTY();

    const tui = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        auth: {
          whoami: async () => ({
            userId: "user_1",
            orgId: DEFAULT_ORG_ID,
            email: "admin@local",
            role: "owner",
          }),
        },
        flags: {
          list: async () => [],
          set: async () => ({ ok: true }),
        },
        inference: {
          health: async () => ({ status: "ok" }),
        },
        docs: {
          templates: {
            list: async () => orgTemplates,
          },
        },
      },
    });

    try {
      await tui.mount();

      // Press 'n' to open new-doc flow (pick-type phase)
      tty.inject("n");
      await new Promise((r) => setTimeout(r, 50));

      // Press Enter to select first doc type → advances to edit-body phase
      tty.inject("\r");
      await new Promise((r) => setTimeout(r, 50));

      const output = tty.plainText();
      // New-doc screen should be visible
      expect(output).toContain("New Document");
      // Template body should appear (from the first/selected doc_type)
      const hasTemplate = DOC_TYPES.some((dt) => output.includes(`## ${dt} default body`));
      expect(hasTemplate).toBe(true);
    } finally {
      tui.stop();
    }
  });

  test("template load failures render an error state instead of escaping key handling", async () => {
    const tty = new FakeTTY();

    const tui = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        auth: {
          whoami: async () => ({
            userId: "user_1",
            orgId: DEFAULT_ORG_ID,
            email: "admin@local",
            role: "owner",
          }),
        },
        flags: {
          list: async () => [],
          set: async () => ({ ok: true }),
        },
        inference: {
          health: async () => ({ status: "ok" }),
        },
        docs: {
          templates: {
            list: async () => {
              throw new Error("template service unavailable");
            },
          },
        },
      },
    });

    try {
      await tui.mount();
      tty.inject("n");
      await new Promise((r) => setTimeout(r, 50));

      const output = tty.plainText();
      expect(output).toContain("New Document");
      expect(output).toContain("Template load failed");
      expect(output).toContain("template service unavailable");
    } finally {
      tui.stop();
    }
  });

  test("new-doc placeholder without docs caller can escape via q, Escape, and Ctrl-C", async () => {
    for (const [key, mode] of [
      ["q", "nav"],
      ["\x1b", "nav"],
      ["\x03", "exit"],
    ] as const) {
      const tty = new FakeTTY();
      let exitCount = 0;
      const tui = new TuiApp({
        output: tty,
        input: tty,
        onExit: () => {
          exitCount++;
          tui.stop();
        },
        caller: {
          auth: {
            whoami: async () => ({
              userId: "user_1",
              orgId: DEFAULT_ORG_ID,
              email: "admin@local",
              role: "owner",
            }),
          },
          flags: {
            list: async () => [],
            set: async () => ({ ok: true }),
          },
          inference: {
            health: async () => ({ status: "ok" }),
          },
        },
      });

      try {
        await tui.mount();
        tty.inject("n");
        await new Promise((r) => setTimeout(r, 50));
        expect(tui.screen).toBe("new-doc");
        expect(tty.plainText()).toContain("Docs service not available");

        tty.inject(key);
        await new Promise((r) => setTimeout(r, 50));

        if (mode === "nav") {
          expect(tui.screen).toBe("nav");
          expect(exitCount).toBe(0);
          expect(tty.plainText()).toContain("Auth");
        } else {
          expect(exitCount).toBe(1);
        }
      } finally {
        tui.stop();
      }
    }
  });
});
