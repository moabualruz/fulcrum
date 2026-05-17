type CreateCredential = typeof import("@platform-core/application/legacy/web-runtime.ts").createCredential;
type GetTenantSetting = typeof import("@platform-core/application/legacy/web-runtime.ts").getTenantSetting;
type ListConnectorRuns = typeof import("@platform-core/application/legacy/web-runtime.ts").listConnectorRuns;
type UpsertTenantSetting = typeof import("@platform-core/application/legacy/web-runtime.ts").upsertTenantSetting;

export async function createCredential(
  ...args: Parameters<CreateCredential>
): Promise<Awaited<ReturnType<CreateCredential>>> {
  const runtime = await import("@platform-core/application/legacy/web-runtime.ts");
  return runtime.createCredential(...args);
}

export async function getTenantSetting(
  ...args: Parameters<GetTenantSetting>
): Promise<Awaited<ReturnType<GetTenantSetting>>> {
  const runtime = await import("@platform-core/application/legacy/web-runtime.ts");
  return runtime.getTenantSetting(...args);
}

export async function listConnectorRuns(
  ...args: Parameters<ListConnectorRuns>
): Promise<Awaited<ReturnType<ListConnectorRuns>>> {
  const runtime = await import("@platform-core/application/legacy/web-runtime.ts");
  return runtime.listConnectorRuns(...args);
}

export async function upsertTenantSetting(
  ...args: Parameters<UpsertTenantSetting>
): Promise<Awaited<ReturnType<UpsertTenantSetting>>> {
  const runtime = await import("@platform-core/application/legacy/web-runtime.ts");
  return runtime.upsertTenantSetting(...args);
}
