<script lang="ts">
  import RoutingPage from "./RoutingPage.svelte";
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<RoutingPage {data} {form} />
