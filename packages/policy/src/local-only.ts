export type RemoteActionKind =
  | "remote_pm"
  | "remote_model"
  | "telemetry"
  | "remote_observability"
  | "public_bind"
  | "remote_provider";

export function assertLocalOnlyAllows(localOnly: boolean, action: RemoteActionKind): void {
  if (localOnly) {
    throw new Error(`Local-only mode denies ${action}.`);
  }
}

export function localOnlyAllows(localOnly: boolean, action: RemoteActionKind): boolean {
  try {
    assertLocalOnlyAllows(localOnly, action);
    return true;
  } catch {
    return false;
  }
}
