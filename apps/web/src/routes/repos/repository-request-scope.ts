export async function requestRepositoryScope(locals: App.Locals, activeProjectId: string | null) {
  const scope = await import("$lib/server/application-scope");
  return scope.requestAppScope(locals, activeProjectId);
}
