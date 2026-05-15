export async function requestProjectScope(locals: App.Locals, projectId: string) {
  const scope = await import("$lib/server/application-scope");
  return scope.requestAppScope(locals, projectId);
}
