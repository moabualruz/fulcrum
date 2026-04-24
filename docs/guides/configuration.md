# Configuration

---

## `.fulcrum.json`

Created automatically on first `fulcrum` command invocation. Deterministic `workspace_id` and `project_id` are derived from the absolute path — two agents running in the same checkout always see the same IDs.

```json
{
  "workspace_id": "my-workspace",
  "project_id":   "my-project",
  "port":         4721,
  "policy": {
    "wip_limit":                    5,
    "wip_limit_per_role":           { "software_engineer": 2 },
    "heartbeat_timeout_minutes":    10,
    "escalation_timeout_minutes":   30
  },
  "embedding": {
    "text": {
      "provider":   "local",
      "model":      "onnx-community/Qwen3-Embedding-0.6B-ONNX",
      "dimensions": 1024,
      "device":     "auto"
    }
  },
  "reranker": {
    "provider": "local",
    "model":    "onnx-community/bge-reranker-v2-m3-ONNX",
    "device":   "auto"
  },
  "vault": {
    "path":       "~/.fulcrum/vault",
    "l2_enabled": false
  }
}
```

---

## Environment Variables

| Env var | Overrides / Description |
|---------|------------------------|
| `FULCRUM_WORKSPACE_ID` | Override computed `workspace_id` |
| `FULCRUM_PROJECT_ID` | Override computed `project_id` |
| `FULCRUM_PORT` | HTTP monitor port (default 4721) |
| `FULCRUM_VAULT_PATH` | Override default vault path (`~/.fulcrum/vault`) |
| `FULCRUM_DATA_DIR` | Override the global data directory (default `~/.fulcrum`) — affects DB, vault, models, plugins |
| `FULCRUM_MONITOR_PORT` | Port the monitor server listens on, and the port `get_current_context` probes to determine `monitor_running` (default 4721) |
| `FULCRUM_NO_MONITOR` | Set to `1` to skip the monitor health probe in `get_current_context` entirely — `monitor_running` always returns `false` |
| `FULCRUM_AGENT_ADAPTER` | Default worker adapter name (`stub` / `subprocess` / custom) |
| `FULCRUM_AGENT_STUB_DIR` | Directory with canned `WorkerResult` JSON for the stub adapter |
| `FULCRUM_AGENT_SUBPROCESS_CMD` | Command line for the subprocess adapter |
| `FULCRUM_CLAUDE_BIN` | Absolute path to the Claude CLI binary (overrides PATH discovery in `claude-code` adapter) |
| `FULCRUM_CLAUDE_TIMEOUT_MS` | Claude adapter subprocess timeout in ms (default 1 800 000 = 30 min) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Enable OTLP span export to a collector |
| `ANTHROPIC_API_KEY` | Enables Track 2 LLM semantic extraction in the memory pipeline |
| `TAVILY_API_KEY` | Enables Tavily web search in the `search_web` workflow step |
| `SERPER_API_KEY` | Enables Serper web search in the `search_web` workflow step (fallback to Tavily) |
| `PLANE_API_KEY` | Plane sync credentials |
| `PLANE_BASE_URL` | Plane API base URL |
| `PLANE_WORKSPACE_SLUG` | Plane workspace |
| `PLANE_PROJECT_ID` | Plane project |

For local embeddings and the local reranker, `"device": "auto"` probes Transformers.js CUDA first, then WebGPU, then CPU/WASM. Use `"cpu"` to skip GPU probes, `"cuda"` to require CUDA, or `"webgpu"` to require WebGPU.

---

## Auto-init

No explicit init step. Every `fulcrum` command auto-initializes `$CWD` on first run:

- Creates `.fulcrum/fulcrum.db` (SQLite with WAL + FTS5, 52 migrations applied)
- Writes `.fulcrum.json` with deterministic `workspace_id` / `project_id`
- Inserts a default workspace and project row

The deterministic-ID trick means two agents running in the same checkout always see the same Fulcrum state, even if one ran through Claude and the other through Gemini.
