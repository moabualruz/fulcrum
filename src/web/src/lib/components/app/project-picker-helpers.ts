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
  const res = await (opts?.fetch ?? fetch)("/api/active-project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (res.ok) {
    opts?.onSuccess?.();
    return { ok: true, status: res.status };
  }
  let error: string | undefined;
  try {
    error = ((await res.json()) as { error?: string }).error;
  } catch {
    /* non-JSON body */
  }
  return { ok: false, status: res.status, error };
}
