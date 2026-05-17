import { describe, expect, test } from "bun:test";

import { buildProjectCommandItems } from "./project-command-items.ts";

describe("project command item generation", () => {
  test("defaults mutation commands to the active project scope", () => {
    const items = buildProjectCommandItems({ activeProjectId: "project-alpha" });

    expect(items.find((item) => item.id === "create-task")).toMatchObject({
      href: "/projects/project-alpha/board?new=task",
      scope: { projectId: "project-alpha", mode: "current" },
      traceTarget: { kind: "project", id: "project-alpha" },
    });
    expect(items.find((item) => item.id === "create-doc")).toMatchObject({
      href: "/projects/project-alpha/docs/new",
      scope: { projectId: "project-alpha", mode: "current" },
      traceTarget: { kind: "project", id: "project-alpha" },
    });
  });

  test("uses explicit all-projects read/navigation state when no active project is selected", () => {
    const items = buildProjectCommandItems({ activeProjectId: null });

    expect(items.find((item) => item.id === "create-task")).toMatchObject({
      href: "/boards?new=task",
      scope: { projectId: null, mode: "all" },
      traceTarget: { kind: "workspace", id: "all-projects" },
    });
    expect(items.find((item) => item.id === "search")).toMatchObject({
      href: "/search?scope=all",
      scope: { projectId: null, mode: "all" },
    });
  });

  test("keeps operational navigation commands global and non-mutating", () => {
    const items = buildProjectCommandItems({ activeProjectId: "project-alpha" });

    expect(items.find((item) => item.id === "doctor")).toMatchObject({
      href: "/doctor",
      scope: { projectId: null, mode: "system" },
      mutation: false,
    });
  });

  test("adds project management shortcuts for modules, intake, and saved views", () => {
    const items = buildProjectCommandItems({ activeProjectId: "project-alpha" });

    expect(items.find((item) => item.id === "project-modules")).toMatchObject({
      href: "/projects/project-alpha/modules",
      scope: { projectId: "project-alpha", mode: "current" },
      traceTarget: { kind: "project", id: "project-alpha" },
      mutation: false,
    });
    expect(items.find((item) => item.id === "project-intake")).toMatchObject({
      href: "/projects/project-alpha/intake",
      scope: { projectId: "project-alpha", mode: "current" },
      mutation: false,
    });
    expect(items.find((item) => item.id === "saved-views")).toMatchObject({
      href: "/projects/project-alpha/settings/views",
      scope: { projectId: "project-alpha", mode: "current" },
      mutation: false,
    });
    expect(items.find((item) => item.id === "create-module")).toMatchObject({
      href: "/projects/project-alpha/modules?new=module",
      mutation: true,
    });
    expect(items.find((item) => item.id === "create-intake-request")).toMatchObject({
      href: "/projects/project-alpha/intake?new=request",
      mutation: true,
    });
    expect(items.find((item) => item.id === "create-saved-view")).toMatchObject({
      href: "/projects/project-alpha/settings/views?new=view",
      mutation: true,
    });
  });
});
