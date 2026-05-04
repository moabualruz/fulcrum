import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";

import { useTheme, type ThemeClient } from "./useTheme.ts";

describe("useTheme", () => {
  test("is SSR-safe before load is called", () => {
    const theme = useTheme({
      listThemes: async () => [{ key: "theme.accent", value: "#6D28D9" }],
      setTheme: async () => undefined,
    });

    expect(get(theme.values)).toEqual({});
  });

  test("loads theme values and applies updates through injected document", async () => {
    const styles: Record<string, string> = {};
    const client: ThemeClient = {
      listThemes: async () => [{ key: "theme.accent", value: "#6D28D9" }],
      setTheme: async ({ key, value }) => ({ key, value }),
    };

    const theme = useTheme(client, {
      document: {
        documentElement: {
          style: {
            setProperty: (key: string, value: string) => {
              styles[key] = value;
            },
          },
        },
      },
    });

    await theme.load();
    expect(get(theme.values)["theme.accent"]).toBe("#6D28D9");
    expect(styles["--fulcrum-accent"]).toBe("#6D28D9");

    await theme.setTheme("accent", "#2563EB");
    expect(get(theme.values)["theme.accent"]).toBe("#2563EB");
    expect(styles["--fulcrum-accent"]).toBe("#2563EB");
  });
});
