<script lang="ts">
  import { cn } from "$lib/utils.js";

  interface Props {
    traceId?: string | null;
    requestId?: string | null;
  }

  let { traceId = null, requestId = null }: Props = $props();

  const resolvedTraceId = $derived(traceId ?? requestId ?? generatedTraceId());
  let copyState = $state<"idle" | "copied" | "error">("idle");

  function generatedTraceId(): string {
    if (typeof window === "undefined") return "trace-init";
    if (!("crypto" in window) || typeof window.crypto.randomUUID !== "function") {
      return `trace-${Math.random().toString(36).slice(2, 10)}`;
    }
    return `trace-${window.crypto.randomUUID().slice(0, 8)}`;
  }

  async function copyTraceId(): Promise<void> {
    if (!resolvedTraceId) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(resolvedTraceId);
      }
      copyState = "copied";
    } catch {
      copyState = "error";
    }
    setTimeout(() => { copyState = "idle"; }, 1500);
  }
</script>

<footer
  data-trace-footer
  class={cn(
    "flex items-center justify-end gap-2 border-t border-border bg-background px-4 py-1.5 text-xs text-muted-foreground",
  )}
>
  <span class="font-mono">trace_id:</span>
  <span data-trace-footer-id class="font-mono">{resolvedTraceId}</span>
  <button
    type="button"
    data-trace-footer-copy
    data-trace-footer-state={copyState}
    onclick={copyTraceId}
    class={cn(
      "rounded-md border border-border px-2 py-0.5 text-[10px] font-medium hover:bg-muted",
    )}
    aria-label="Copy trace id"
  >
    {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
  </button>
</footer>
