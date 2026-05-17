export async function requestServiceScope(
  locals: App.Locals,
  activeProjectId?: string | null,
  taskId?: string,
  runId?: string,
) {
  const scope = await import("$lib/server/application-scope");
  return scope.requestAppScope(locals, activeProjectId ?? null, taskId, runId);
}
