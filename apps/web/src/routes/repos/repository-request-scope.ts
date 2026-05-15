export async function requestRepositoryScope(locals: App.Locals, activeProjectId: string | null) {
  const scope = await import("$lib/server/request-service-scope");
  return scope.requestServiceScope(locals, activeProjectId);
}
