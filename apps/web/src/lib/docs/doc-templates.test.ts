import { describe, expect, test } from "vitest";

import {
  groupTemplatesByDocType,
  resolveDefaultTemplate,
  templateRowsToBodyMap,
  type WebDocTemplate,
} from "./doc-templates";

const rows: WebDocTemplate[] = [
  {
    id: "org-adr",
    orgId: "org",
    projectId: null,
    docType: "adr",
    name: "Default adr",
    frontmatterTemplate: {},
    bodyTemplate: "org ADR",
    isDefault: true,
    createdAt: new Date("2026-05-02T00:00:00Z"),
  },
  {
    id: "project-adr",
    orgId: "org",
    projectId: "project",
    docType: "adr",
    name: "Project adr",
    frontmatterTemplate: {},
    bodyTemplate: "project ADR",
    isDefault: true,
    createdAt: new Date("2026-05-03T00:00:00Z"),
  },
  {
    id: "org-note",
    orgId: "org",
    projectId: null,
    docType: "note",
    name: "Default note",
    frontmatterTemplate: {},
    bodyTemplate: "org note",
    isDefault: true,
    createdAt: new Date("2026-05-02T00:00:00Z"),
  },
];

describe("doc template web helpers", () => {
  test("resolveDefaultTemplate prefers project default over org default for same doc_type", () => {
    expect(resolveDefaultTemplate(rows, "adr")?.id).toBe("project-adr");
    expect(resolveDefaultTemplate(rows, "note")?.id).toBe("org-note");
  });

  test("templateRowsToBodyMap exposes project override bodies for new-doc wizard", () => {
    expect(templateRowsToBodyMap(rows).adr).toBe("project ADR");
    expect(templateRowsToBodyMap(rows).note).toBe("org note");
  });

  test("groupTemplatesByDocType keeps all rows grouped for settings UI", () => {
    const grouped = groupTemplatesByDocType(rows);

    expect(grouped.adr.map((row) => row.id)).toEqual(["project-adr", "org-adr"]);
    expect(grouped.note.map((row) => row.id)).toEqual(["org-note"]);
  });
});
