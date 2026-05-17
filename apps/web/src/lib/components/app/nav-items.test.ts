import { describe, expect, test } from "bun:test";

import { LUCIDE_ICONS, NAV_GROUPS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

describe("NAV_ITEMS surface", () => {
  test("declares grouped primary surface", () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Current Scope", "Portfolio", "System"]);
    expect(NAV_GROUPS.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/", "/boards", "/docs", "/planning", "/runs", "/artifacts"],
      ["/projects", "/search", "/memory", "/context/preview"],
      ["/agents", "/orchestration", "/audit", "/doctor", "/settings/inference"],
    ]);
  });

  test("exposes hrefs in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/boards",
      "/docs",
      "/planning",
      "/runs",
      "/artifacts",
      "/projects",
      "/search",
      "/memory",
      "/context/preview",
      "/agents",
      "/orchestration",
      "/audit",
      "/doctor",
      "/settings/inference",
    ]);
  });

  test("exposes labels in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Board",
      "Docs",
      "Planning",
      "Runs",
      "Artifacts",
      "All projects",
      "Search",
      "Memory",
      "Context",
      "Agents",
      "Orchestration",
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
      ["/boards", "Kanban"],
      ["/docs", "FileText"],
      ["/planning", "FileText"],
      ["/runs", "Activity"],
      ["/artifacts", "FileText"],
      ["/projects", "Folder"],
      ["/search", "Search"],
      ["/memory", "FileText"],
      ["/context/preview", "FileText"],
      ["/agents", "Activity"],
      ["/orchestration", "Kanban"],
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
