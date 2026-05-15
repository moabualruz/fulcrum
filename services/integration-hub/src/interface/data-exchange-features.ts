export function isDataExchangeFeatureEnabled(name: string): boolean {
  const raw = process.env["FULCRUM_FEATURES"] ?? "";
  if (!raw.trim()) return false;
  return raw.split(",").map((entry) => entry.trim()).includes(name);
}
