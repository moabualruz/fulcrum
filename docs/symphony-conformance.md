# Symphony Conformance Trace

Source: `vendor/openai-symphony/SPEC.md`
Lock: `.symphony-spec.lock`

## 18.1 REQUIRED for Conformance

### Workflow path selection supports explicit runtime path and cwd default

### `WORKFLOW.md` loader with YAML front matter + prompt body split

### Typed config layer with defaults and `$` resolution

### Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt

### Polling orchestrator with single-authority mutable state

### Issue tracker client with candidate fetch + state refresh + terminal fetch

### Workspace manager with sanitized per-issue workspaces

### Workspace lifecycle hooks (`after_create`, `before_run`, `after_run`, `before_remove`)

### Hook timeout config (`hooks.timeout_ms`, default `60000`)

### Coding-agent app-server subprocess client with JSON line protocol

### Codex launch command config (`codex.command`, default `codex app-server`)

### Strict prompt rendering with `issue` and `attempt` variables

### Exponential retry queue with continuation retries after normal exit

### Configurable retry backoff cap (`agent.max_retry_backoff_ms`, default 5m)

### Reconciliation that stops runs on terminal/non-active tracker states

### Workspace cleanup for terminal issues (startup sweep + active transition)

### Structured logs with `issue_id`, `issue_identifier`, and `session_id`

### Operator-visible observability (structured logs; OPTIONAL snapshot/status surface)
