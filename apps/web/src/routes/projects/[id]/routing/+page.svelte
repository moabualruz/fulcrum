<script lang="ts">
  import RoutingPage from "../../../settings/routing/RoutingPage.svelte";
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<RoutingPage {data} {form} />
