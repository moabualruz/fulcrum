function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function encodeJsonValue(value: unknown): string {
  return JSON.stringify(value);
}

function encodeTomlValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

function readOwnedKeys(root: unknown, ownershipMarker: string): string[] {
  if (!root || typeof root !== "object") return [];
  const marker = (root as Record<string, unknown>)[ownershipMarker];
  return Array.isArray(marker) ? marker.filter((item): item is string => typeof item === "string") : [];
}

export function patchJsonOwnedKey(
  source: string,
  path: string[],
  value: unknown,
  ownershipMarker: string,
): string {
  const root = JSON.parse(source) as unknown;
  const dottedPath = path.join(".");
  if (!readOwnedKeys(root, ownershipMarker).includes(dottedPath)) {
    throw new Error(`config path ${dottedPath} is not owned by Fulcrum`);
  }
  if (path.length !== 1) {
    throw new Error("targeted JSON patch currently supports top-level owned keys only");
  }

  const key = path[0]!;
  const re = new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*)(?:"(?:\\\\.|[^"])*"|true|false|null|-?\\d+(?:\\.\\d+)?)(\\s*[,}\\n])`);
  const patched = source.replace(re, (_match, prefix: string, suffix: string) => {
    return `${prefix}${encodeJsonValue(value)}${suffix}`;
  });
  if (patched === source) throw new Error(`config path ${dottedPath} not found`);
  return patched;
}

function readTomlOwnedKeys(source: string, ownershipMarker: string): string[] {
  const re = new RegExp(`^\\s*${escapeRegExp(ownershipMarker)}\\s*=\\s*\\[(.*?)\\]\\s*$`, "m");
  const match = source.match(re);
  if (!match) return [];
  return Array.from(match[1]!.matchAll(/"([^"]+)"/g)).map((m) => m[1]!);
}

export function patchTomlOwnedKey(
  source: string,
  dottedKey: string,
  value: unknown,
  ownershipMarker: string,
): string {
  if (!readTomlOwnedKeys(source, ownershipMarker).includes(dottedKey)) {
    throw new Error(`config key ${dottedKey} is not owned by Fulcrum`);
  }

  const parts = dottedKey.split(".");
  const key = parts.pop();
  if (!key) throw new Error("empty TOML key");
  const section = parts.join(".");
  const sectionHeader = section ? `[${section}]` : "";
  const sectionStart = sectionHeader ? source.indexOf(sectionHeader) : 0;
  if (sectionStart === -1) throw new Error(`TOML section ${section} not found`);
  const searchStart = sectionHeader ? sectionStart + sectionHeader.length : 0;
  const nextSection = source.slice(searchStart).search(/\n\[[^\]]+\]/);
  const searchEnd = nextSection === -1 ? source.length : searchStart + nextSection;
  const region = source.slice(searchStart, searchEnd);
  const keyRe = new RegExp(`(^|\\n)([ \\t]*)${escapeRegExp(key)}\\s*=\\s*([^\\n]*)`);
  const match = region.match(keyRe);
  if (!match?.index) {
    if (match?.index !== 0) throw new Error(`TOML key ${dottedKey} not found`);
  }
  const index = match.index ?? 0;
  const lineStart = searchStart + index + match[1]!.length;
  const lineEnd = source.indexOf("\n", lineStart);
  const end = lineEnd === -1 ? source.length : lineEnd;
  const replacement = `${match[2]}${key} = ${encodeTomlValue(value)}`;
  return `${source.slice(0, lineStart)}${replacement}${source.slice(end)}`;
}
