export function isSaasAuthFeatureEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env["FULCRUM_FLAG_SAAS_AUTH"] === "true") return true;
  const features = (env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);
  return features.includes("saas-auth");
}
