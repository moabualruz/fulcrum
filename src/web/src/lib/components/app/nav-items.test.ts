import { describe, expect, test } from "bun:test";

import { LUCIDE_ICONS, NAV_ITEMS, type NavItem } from "./nav-items.ts";

describe("NAV_ITEMS surface", () => {
  test("declares exactly 6 items", () => {
    expect(NAV_ITEMS).toHaveLength(6);
  });

  test("exposes hrefs in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/",
      "/projects",
      "/docs",
      "/boards",
      "/runs",
      "/search",
    ]);
  });

  test("exposes labels in declared order", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Dashboard",
      "Projects",
      "Docs",
      "Board",
      "Runs",
      "Search",
    ]);
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
      ["/docs", "FileText"],
      ["/boards", "Kanban"],
      ["/runs", "Activity"],
      ["/search", "Search"],
    ];
    for (const [href, iconName] of pairs) {
      const entry = NAV_ITEMS.find((i) => i.href === href);
      expect(entry?.iconName).toBe(iconName);
    }
  });
});
