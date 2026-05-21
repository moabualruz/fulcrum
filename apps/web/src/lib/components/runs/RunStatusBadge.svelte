<script lang="ts" module>
  import type { RunStatus } from "$lib/server/runs";
  import type { WorkflowStatus } from "@fulcrum/ui-kit";

  /**
   * Maps the run-domain `RunStatus` enum onto the canonical cross-surface
   * `WorkflowStatus` vocabulary owned by the `@fulcrum/ui-kit` StatusBadge
   * primitive. The run domain says "succeeded"; the canonical vocabulary
   * (COPY.md §6) says "completed": keep the translation here so the badge
   * itself stays a pure ui-kit primitive.
   */
  export function toWorkflowStatus(s: RunStatus): WorkflowStatus {
    switch (s) {
      case "succeeded":
        return "completed";
      case "running":
        return "running";
      case "queued":
        return "queued";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
    }
  }
</script>

<script lang="ts">
  import { StatusBadge } from "@fulcrum/ui-kit";

  interface Props {
    status: RunStatus;
  }

  const { status }: Props = $props();
</script>

<!--
  Run status rendering delegates entirely to the `StatusBadge` ui-kit primitive.
  `data-run-status` + `data-status` carry the run-domain status for existing
  route selectors; the visual treatment is the canonical OKLCH-tokened badge.
-->
<span data-run-status data-status={status} class="contents">
  <StatusBadge status={toWorkflowStatus(status)} />
</span>
