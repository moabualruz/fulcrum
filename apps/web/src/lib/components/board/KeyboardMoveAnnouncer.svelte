<script lang="ts">
  interface Props {
    message: string | null;
  }

  const { message }: Props = $props();
</script>

<div data-keyboard-announcer aria-live="polite" aria-atomic="true" class="sr-only">{message ?? ""}</div>
