import { writable, type Readable } from "svelte/store";

type ThemePair = {
  key: string;
  value: string;
};

export type ThemeClient = {
  listThemes(): Promise<ThemePair[]>;
  setTheme(input: { key: string; value: string }): Promise<ThemePair | void>;
};

export type ThemeDocument = {
  documentElement: {
    style: {
      setProperty(key: string, value: string): void;
    };
  };
};

export type ThemeComposable = {
  values: Readable<Record<string, string>>;
  load(): Promise<void>;
  setTheme(key: string, value: string): Promise<void>;
};

type ThemeEnvironment = {
  document?: ThemeDocument;
};

function cssVarName(key: string): string {
  const suffix = key.startsWith("theme.") ? key.slice("theme.".length) : key;
  return `--fulcrum-${suffix}`;
}

function normalizeThemeKey(key: string): string {
  return key.startsWith("theme.") ? key : `theme.${key}`;
}

function applyThemeValues(values: Record<string, string>, document?: ThemeDocument) {
  if (!document) return;
  for (const [key, value] of Object.entries(values)) {
    document.documentElement.style.setProperty(cssVarName(key), value);
  }
}

function resolveDocument(env?: ThemeEnvironment): ThemeDocument | undefined {
  if (env?.document) return env.document;
  if (typeof document === "undefined") return undefined;
  return document;
}

export function useTheme(client: ThemeClient, env?: ThemeEnvironment): ThemeComposable {
  const values = writable<Record<string, string>>({});
  const targetDocument = resolveDocument(env);

  async function load() {
    const rows = await client.listThemes();
    const next = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    values.set(next);
    applyThemeValues(next, targetDocument);
  }

  async function setTheme(key: string, value: string) {
    const normalizedKey = normalizeThemeKey(key);
    await client.setTheme({ key: normalizedKey, value });
    values.update((current) => {
      const next = { ...current, [normalizedKey]: value };
      applyThemeValues(next, targetDocument);
      return next;
    });
  }

  return {
    values: { subscribe: values.subscribe },
    load,
    setTheme,
  };
}
