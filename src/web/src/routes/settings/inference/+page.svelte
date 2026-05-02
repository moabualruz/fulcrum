<script lang="ts">
  let { data } = $props();
</script>

<section class="inference-settings">
  <h1>Inference</h1>

  {#await data.streamed.health}
    <p>Loading inference status</p>
  {:then health}
    <p class="status" data-status={health.status}>Backend status: {health.status}</p>
    <p>Backends: {health.backends.join(", ")}</p>
  {:catch}
    <p class="status" data-status="down">Backend status: down</p>
  {/await}

  <h2>Models</h2>
  {#await data.streamed.models}
    <p>Loading models</p>
  {:then models}
    {#if models.length === 0}
      <p>No models downloaded.</p>
    {:else}
      <ul>
        {#each models as model}
          <li>{model.id} · {model.kind} · {model.downloaded ? "downloaded" : "missing"}</li>
        {/each}
      </ul>
    {/if}
  {:catch}
    <p>Model list unavailable.</p>
  {/await}
</section>

<style>
  .inference-settings {
    max-width: 900px;
    padding: 2rem;
  }

  .status {
    font-weight: 600;
  }
</style>
