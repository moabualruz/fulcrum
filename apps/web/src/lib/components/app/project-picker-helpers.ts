// Thin fetch wrapper used by ProjectPicker. Tests stub `fetch` + `onSuccess`.
export interface SelectProjectResult {
  ok: boolean;
  status: number;
  error?: string;
}
export async function selectProject(
  slug: string | null,
  opts?: { fetch?: typeof fetch; onSuccess?: () => void },
): Promise<SelectProjectResult> {
  const res = await (opts?.fetch ?? globalThis.fetch)("/api/active-project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (res.status === 204) {
    opts?.onSuccess?.();
    return { ok: true, status: 204 };
  }
  if (res.status === 400) {
    let error = "bad request";
    try {
      error = ((await res.json()) as { error?: string }).error ?? error;
    } catch {
      /* non-JSON body */
    }
    return { ok: false, status: 400, error };
  }
  return { ok: false, status: res.status, error: "unexpected" };
}
