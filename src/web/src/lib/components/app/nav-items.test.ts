import { describe, expect, test } from "bun:test";

import { LUCIDE_ICONS, NAV_GROUPS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

describe("NAV_ITEMS surface", () => {
  test("declares grouped primary surface", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Work", "Agent OS", "System", "Settings"]);
    expect(NAV_GROUPS.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/", "/projects", "/boards", "/docs"],
      ["/agents", "/runs", "/artifacts", "/orchestration", "/memory", "/context/preview"],
      ["/search", "/audit", "/doctor"],
      ["/settings/inference"],
    ]);
  });

  test("exposes hrefs in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/projects",
      "/boards",
      "/docs",
      "/agents",
      "/runs",
      "/artifacts",
      "/orchestration",
      "/memory",
      "/context/preview",
      "/search",
      "/audit",
      "/doctor",
      "/settings/inference",
    ]);
  });

  test("exposes labels in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "Board",
      "Docs",
      "Agents",
      "Runs",
      "Artifacts",
      "Orchestration",
      "Memory",
      "Context",
      "Search",
      "Audit",
      "Doctor",
      "Settings",
    ]);
  });

  test("does not expose project-scoped repos as a primary nav item", () => {
    expect(NAV_ITEMS.find((i) => i.href === "/repos")).toBeUndefined();
  });

  test("each entry uses an icon resolvable through LUCIDE_ICONS", () => {
    for (const item of NAV_ITEMS) {
      expect(LUCIDE_ICONS).toHaveProperty(item.iconName);
      expect(typeof LUCIDE_ICONS[item.iconName]).toBe("function");
    }
  });

  test("locks the icon assignment per entry", () => {
    const pairs: Array<[string, NavItem["iconName"]]> = [
      ["/", "LayoutDashboard"],
      ["/projects", "Folder"],
      ["/boards", "Kanban"],
      ["/docs", "FileText"],
      ["/agents", "Activity"],
      ["/runs", "Activity"],
      ["/artifacts", "FileText"],
      ["/orchestration", "Kanban"],
      ["/memory", "FileText"],
      ["/context/preview", "FileText"],
      ["/search", "Search"],
      ["/audit", "FileText"],
      ["/doctor", "Activity"],
      ["/settings/inference", "Settings"],
    ];
    for (const [href, iconName] of pairs) {
      const entry = NAV_ITEMS.find((i) => i.href === href);
      expect(entry?.iconName).toBe(iconName);
    }
  });
});
