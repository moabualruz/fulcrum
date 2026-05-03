<script lang="ts">
  let { data, form } = $props();
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
          <li class="model-row">
            <span>{model.id} · {model.kind} · {model.downloaded ? "downloaded" : "missing"}</span>
            {#if !model.downloaded}
              <form method="POST" action="?/pullModel">
                <input type="hidden" name="modelId" value={model.id} />
                <button type="submit">Download</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:catch}
    <p>Model list unavailable.</p>
  {/await}

  {#if form?.pullProgress}
    <div
      class="download-progress"
      data-model-download-progress={form.pullProgress.pct}
      aria-live="polite"
    >
      <p>{form.pullProgress.modelId} download {form.pullProgress.pct}%</p>
      <progress value={form.pullProgress.pct} max="100"></progress>
    </div>
  {/if}

  <h2>Per-feature backend routing</h2>
  <div class="routing-config" data-routing-config>
    {#each Object.entries(form?.routingConfig ?? data.routingConfig ?? {}) as [feature, backend]}
      <form method="POST" action="?/setRouting" class="routing-row">
        <label for="routing-{feature}">{feature}</label>
        <input type="hidden" name="feature" value={feature} />
        <select id="routing-{feature}" name="backend">
          {#each data.backendIds ?? [] as bid}
            <option value={bid} selected={bid === backend}>{bid}</option>
          {/each}
        </select>
        <button type="submit">Save</button>
      </form>
    {/each}
    {#if form?.routingSaved}
      <p class="routing-status" data-routing-saved>Routing updated.</p>
    {/if}
    {#if form?.routingError}
      <p class="routing-status routing-error" data-routing-error>{form.routingError}</p>
    {/if}
  </div>

  {#if data.externalProviderEnabled}
    <h2>External LLM Provider</h2>
    <div class="external-provider" data-external-provider>
      <form method="POST" action="?/setProvider" class="embed-form">
        <label for="provider-url">URL</label>
        <input id="provider-url" name="providerUrl" type="url" placeholder="https://api.openai.com/v1" />
        <label for="provider-key">API Key</label>
        <input id="provider-key" name="providerKey" type="password" placeholder="sk-..." />
        <div class="embed-row">
          <button type="submit">Save</button>
          <button type="submit" formaction="?/testProvider">Test Connection</button>
        </div>
      </form>
      {#if form?.providerResult}
        <p class="provider-status" data-provider-ok>Connected (latency: {form.providerResult.latency_ms}ms)</p>
      {/if}
      {#if form?.providerSaved}
        <p class="provider-status" data-provider-saved>Provider saved.</p>
      {/if}
      {#if form?.providerError}
        <p class="provider-status provider-error" data-provider-error>{form.providerError}</p>
      {/if}
    </div>
  {/if}

  <h2>Test embed</h2>
  <form method="POST" action="?/testEmbed" class="embed-form">
    <label for="embed-text">Text</label>
    <div class="embed-row">
      <input id="embed-text" name="text" type="text" value="hello world" />
      <button type="submit">Test embed</button>
    </div>
  </form>

  {#if form?.success && form?.dimensions !== undefined}
    <div class="embed-result" data-embed-dimensions={form.dimensions}>
      <p>Dimensions: {form.dimensions}</p>
      <p>Model: {form.model} · cached={form.cached}</p>
      <p>Preview: {form.preview?.join(", ")}</p>
    </div>
  {:else if form?.error}
    <p class="embed-error" data-embed-error>{form.error}</p>
  {/if}

  <h2>Test generate</h2>
  <form method="POST" action="?/testGenerate" class="embed-form">
    <label for="generate-prompt">Prompt</label>
    <div class="embed-row">
      <input id="generate-prompt" name="prompt" type="text" value="What is the capital of France?" />
      <input name="maxTokens" type="hidden" value="64" />
      <button type="submit">Test generate</button>
    </div>
    <label for="generate-schema">JSON Schema (optional)</label>
    <textarea id="generate-schema" name="schema" rows="4" placeholder={'{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}'}></textarea>
  </form>

  {#if form?.success && form?.generateText !== undefined}
    <div class="generate-result" data-generate-tokens={form.generateTokens}>
      <p>Tokens: {form.generateTokens}</p>
      {#if form.schemaValid !== undefined}
        <p class="schema-validity" data-schema-valid={form.schemaValid}>Schema valid: {form.schemaValid}</p>
      {/if}
      {#if form.schemaValid}
        <pre class="schema-output" data-schema-output>{form.generateText}</pre>
      {:else}
        <p>{form.generateText}</p>
      {/if}
    </div>
  {:else if form?.generateError}
    <p class="embed-error" data-generate-error>{form.generateError}</p>
  {/if}

  <h2>Test classify</h2>
  <form method="POST" action="?/testClassify" class="embed-form">
    <label for="classify-text">Text</label>
    <input id="classify-text" name="text" type="text" value="buy groceries" />
    <label for="classify-labels">Labels</label>
    <div class="embed-row">
      <input id="classify-labels" name="labels" type="text" value="task,question,reminder" />
      <button type="submit">Test classify</button>
    </div>
  </form>

  {#if form?.classifyResults}
    <table class="result-table" data-classify-results={form.classifyResults.length}>
      <thead>
        <tr>
          <th>Label</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {#each form.classifyResults as result}
          <tr>
            <td>{result.label}</td>
            <td>{result.score}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <h2>Test tokenize</h2>
  <form method="POST" action="?/testTokenize" class="embed-form">
    <label for="tokenize-text">Text</label>
    <div class="embed-row">
      <input id="tokenize-text" name="text" type="text" value="hello world" />
      <button type="submit">Test tokenize</button>
    </div>
  </form>

  {#if form?.tokenizeResult}
    <div class="tokenize-result" data-tokenize-count={form.tokenizeResult.count}>
      <p>Tokens: {form.tokenizeResult.count}</p>
      <p>{form.tokenizeResult.tokens.join(", ")}</p>
    </div>
  {/if}
</section>

<style>
  .inference-settings {
    max-width: 900px;
    padding: 2rem;
  }

  .status {
    font-weight: 600;
  }

  .embed-form {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .embed-row {
    display: flex;
    gap: 0.5rem;
  }

  .model-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0.25rem 0;
  }

  .download-progress {
    margin: 1rem 0;
  }

  input {
    min-width: 0;
    flex: 1;
  }

  .embed-result,
  .embed-error,
  .tokenize-result,
  .result-table {
    margin-top: 0.75rem;
  }

  .routing-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }

  .routing-row label {
    min-width: 10rem;
  }

  .result-table {
    border-collapse: collapse;
    width: 100%;
  }

  .result-table th,
  .result-table td {
    border-bottom: 1px solid #ddd;
    padding: 0.35rem 0;
    text-align: left;
  }
</style>
