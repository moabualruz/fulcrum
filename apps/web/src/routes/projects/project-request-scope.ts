export async function requestProjectScope(locals: App.Locals, projectId?: string | null) {
  const scope = await import("$lib/server/request-service-scope");
  return scope.requestServiceScope(locals, projectId ?? null);
}
