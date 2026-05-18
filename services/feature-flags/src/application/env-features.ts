export interface EnvFeatureFlag {
  name: string;
  backend: string | null;
}

export function parseFeatures(raw?: string): EnvFeatureFlag[] {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((token) => {
      const colon = token.indexOf(":");
      if (colon === -1) return { name: token, backend: null };
      return {
        name: token.slice(0, colon),
        backend: token.slice(colon + 1) || null,
      };
    });
}

export function isFeatureEnabled(flags: readonly EnvFeatureFlag[], name: string): boolean;
export function isFeatureEnabled(name: string, raw?: string): boolean;
export function isFeatureEnabled(name: string, flags: readonly EnvFeatureFlag[]): boolean;
export function isFeatureEnabled(
  flagsOrName: readonly EnvFeatureFlag[] | string,
  nameOrRaw?: string | readonly EnvFeatureFlag[],
): boolean {
  if (Array.isArray(flagsOrName)) return flagsOrName.some((flag) => flag.name === nameOrRaw);

  const flags = typeof nameOrRaw === "string" || nameOrRaw === undefined
    ? parseFeatures(nameOrRaw ?? process.env.FULCRUM_FEATURES)
    : nameOrRaw;
  return flags.some((flag) => flag.name === flagsOrName);
}
