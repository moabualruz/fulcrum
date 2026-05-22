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

/**
 * Features that are default-ON outside production. The public REST API surface
 * (`public-api`) must serve `/api/v1/*` on a local dev or test stack without
 * the operator setting `FULCRUM_FEATURES=public-api` by hand — the 38 public-api
 * controllers gate on this check. Production still requires the explicit flag.
 */
const DEV_DEFAULT_ON_FEATURES = new Set(["public-api"]);

function isDevDefaultOn(name: string): boolean {
  return DEV_DEFAULT_ON_FEATURES.has(name) && process.env.NODE_ENV !== "production";
}

export function isFeatureEnabled(flags: readonly EnvFeatureFlag[], name: string): boolean;
export function isFeatureEnabled(name: string, raw?: string): boolean;
export function isFeatureEnabled(name: string, flags: readonly EnvFeatureFlag[]): boolean;
export function isFeatureEnabled(
  flagsOrName: readonly EnvFeatureFlag[] | string,
  nameOrRaw?: string | readonly EnvFeatureFlag[],
): boolean {
  if (Array.isArray(flagsOrName)) {
    return (
      flagsOrName.some((flag) => flag.name === nameOrRaw) ||
      (typeof nameOrRaw === "string" && isDevDefaultOn(nameOrRaw))
    );
  }

  const name = flagsOrName as string;
  const flags = typeof nameOrRaw === "string" || nameOrRaw === undefined
    ? parseFeatures(nameOrRaw ?? process.env.FULCRUM_FEATURES)
    : nameOrRaw;
  return flags.some((flag) => flag.name === name) || isDevDefaultOn(name);
}
