import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { DOC_TYPES } from "@platform-core/infrastructure/application-database/entities/docs/enums.ts";
import {
  AdrFrontmatterSchema,
  FrontmatterSchema,
  FrontmatterSchemaMap,
  MeetingFrontmatterSchema,
  NoteFrontmatterSchema,
  PostmortemFrontmatterSchema,
  RfcFrontmatterSchema,
  RunbookFrontmatterSchema,
  ScratchFrontmatterSchema,
  SpecFrontmatterSchema,
  WikiFrontmatterSchema,
} from "@knowledge-workspace/application/docs/frontmatter-schemas.ts";
import { patchFrontmatterKey } from "@platform-core/application/runtime-support/frontmatter-patcher.ts";

const VALID_FRONTMATTER = {
  spec: { status: "approved" },
  adr: {
    status: "proposed",
    decision: "Use typed frontmatter schemas",
    context: "Doc-type forms need validation metadata",
    consequences: "Invalid YAML is rejected before save",
  },
  wiki: { custom: "kept" },
  runbook: { service: "api", severity_level: "p1" },
  meeting: { date: "2026-05-02T10:30:00.000Z", attendees: ["ada", "grace"] },
  postmortem: {
    impact: "Search was unavailable",
    timeline: "10:00 detected, 10:30 mitigated",
    root_cause: "Bad index migration",
    action_items: ["Add migration smoke test"],
  },
  rfc: { status: "review", summary: "Add typed frontmatter" },
  note: { labels: ["docs"], arbitrary: { nested: true } },
  scratch: { draft: true },
} as const;

const REQUIRED_FIELD_CASES = [
  { docType: "spec", schema: SpecFrontmatterSchema, missing: "status" },
  { docType: "adr", schema: AdrFrontmatterSchema, missing: "decision" },
  { docType: "wiki", schema: WikiFrontmatterSchema, missing: null },
  { docType: "runbook", schema: RunbookFrontmatterSchema, missing: "service" },
  { docType: "meeting", schema: MeetingFrontmatterSchema, missing: "date" },
  { docType: "postmortem", schema: PostmortemFrontmatterSchema, missing: "action_items" },
  { docType: "rfc", schema: RfcFrontmatterSchema, missing: "summary" },
  { docType: "note", schema: NoteFrontmatterSchema, missing: null },
  { docType: "scratch", schema: ScratchFrontmatterSchema, missing: null },
] as const;

describe("frontmatter schemas", () => {
  test("exports a schema map keyed by every DocTypeEnum value", () => {
    expect(Object.keys(FrontmatterSchemaMap).sort()).toEqual([...DOC_TYPES].sort());
  });

  for (const { docType, schema } of REQUIRED_FIELD_CASES) {
    test(`${docType} valid shape passes`, () => {
      expect(schema.parse(VALID_FRONTMATTER[docType])).toEqual(VALID_FRONTMATTER[docType]);
    });
  }

  for (const { docType, schema, missing } of REQUIRED_FIELD_CASES) {
    if (missing !== null) {
      test(`${docType} missing required field throws ZodError`, () => {
      const invalid = { ...VALID_FRONTMATTER[docType] };
      delete invalid[missing as keyof typeof invalid];

      expect(() => schema.parse(invalid)).toThrow(ZodError);
      });
    }
  }

  test("postmortem action_items must be string array", () => {
    expect(() =>
      PostmortemFrontmatterSchema.parse({
        ...VALID_FRONTMATTER.postmortem,
        action_items: "Add migration smoke test",
      }),
    ).toThrow(ZodError);
  });

  test("status and severity enums reject unknown values", () => {
    expect(() => RfcFrontmatterSchema.parse({ status: "queued", summary: "Nope" })).toThrow(
      ZodError,
    );
    expect(() =>
      RunbookFrontmatterSchema.parse({ service: "api", severity_level: "p4" }),
    ).toThrow(ZodError);
    expect(() => SpecFrontmatterSchema.parse({ status: "shipped" })).toThrow(ZodError);
  });

  test("meeting date must be an ISO-8601 string without Date coercion", () => {
    expect(MeetingFrontmatterSchema.parse(VALID_FRONTMATTER.meeting).date).toBe(
      VALID_FRONTMATTER.meeting.date,
    );
    expect(() =>
      MeetingFrontmatterSchema.parse({ date: "May 2, 2026", attendees: ["ada"] }),
    ).toThrow(ZodError);
  });

  test("meeting date accepts ISO-8601 offset datetime without Date coercion", () => {
    const offsetDate = "2026-05-02T10:30:00+02:00";

    expect(MeetingFrontmatterSchema.parse({ date: offsetDate, attendees: ["ada"] }).date).toBe(
      offsetDate,
    );
  });

  test("wiki, note, and scratch preserve unknown keys", () => {
    expect(WikiFrontmatterSchema.parse({ custom: "kept" })).toEqual({ custom: "kept" });
    expect(NoteFrontmatterSchema.parse({ labels: ["docs"], extra: 1 })).toEqual({
      labels: ["docs"],
      extra: 1,
    });
    expect(ScratchFrontmatterSchema.parse({ draft: true })).toEqual({ draft: true });
  });

  test("all parsed values survive JSON round trip unchanged", () => {
    for (const [docType, schema] of Object.entries(FrontmatterSchemaMap)) {
      const input = VALID_FRONTMATTER[docType as keyof typeof VALID_FRONTMATTER];
      const parsed = schema.parse(input);

      expect(JSON.parse(JSON.stringify(parsed))).toEqual(input);
    }
  });

  test("discriminated union selects the doc_type sub-schema", () => {
    const parsed = FrontmatterSchema.parse({
      doc_type: "adr",
      ...VALID_FRONTMATTER.adr,
    });

    expect(parsed).toEqual({
      doc_type: "adr",
      ...VALID_FRONTMATTER.adr,
    });
  });

  test("patchFrontmatterKey preserves unowned frontmatter and body bytes", () => {
    const source = [
      "---",
      "# keep this comment",
      "title: 'Original title'",
      "",
      'status: "draft"',
      "tags: [docs, rules]",
      "---",
      "",
      "# Body",
      "",
      "Body bytes stay exact.",
      "",
    ].join("\n");

    const patched = patchFrontmatterKey(source, "status", "approved");

    expect(patched).toBe([
      "---",
      "# keep this comment",
      "title: 'Original title'",
      "",
      'status: "approved"',
      "tags: [docs, rules]",
      "---",
      "",
      "# Body",
      "",
      "Body bytes stay exact.",
      "",
    ].join("\n"));
  });

  test("patchFrontmatterKey inserts missing scalar before closing delimiter", () => {
    const source = "---\n# comment\ntitle: \"Doc\"\n---\n\nBody\n";

    expect(patchFrontmatterKey(source, "status", "review")).toBe(
      "---\n# comment\ntitle: \"Doc\"\nstatus: \"review\"\n---\n\nBody\n",
    );
  });
});
