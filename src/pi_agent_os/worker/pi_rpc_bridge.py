"""
Real PIRuntimeAdapter implementation via PI RPC subprocess bridge.

Spec §3.1: PI is the authoritative execution host.
B-001 unblock: each spawn_agent() starts a `pi --mode rpc` subprocess,
communicates via JSONL over stdio, and streams events asynchronously.

PI RPC protocol (pi --mode rpc):
  Commands (stdin):  {"id": "req-1", "type": "prompt", "message": "..."}
  Events (stdout):   {"type": "agent_start"} / {"type": "agent_end", ...} / ...
  Responses:         {"type": "response", "command": "prompt", "success": true}

Each spawned agent runs as a separate subprocess.  The run_id returned by
spawn_agent() is a local UUID that maps to the subprocess handle and its
accumulated events.

Prerequisites:
    npm install -g @mariozechner/pi-coding-agent
    npm install -g @tintinweb/pi-subagents   # optional: for team/subagent support

Usage:
    from pi_agent_os.worker.pi_rpc_bridge import PIRPCBridge
    from pi_agent_os.worker.pi_adapter import configure_pi_runtime
    configure_pi_runtime(PIRPCBridge())

    # Or let auto-detection handle it:
    from pi_agent_os.worker.pi_adapter import auto_configure_pi_runtime
    auto_configure_pi_runtime()
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .pi_adapter import PIAgentConfig, PIRunResult, PIRuntimeAdapter

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_pi_command() -> Optional[str]:
    """
    Find the pi coding agent CLI, avoiding any Python virtualenv 'pi' shim.

    Checks in order:
    1. PI_COMMAND env var (explicit override)
    2. Each PATH entry that is NOT inside a Python venv (.venv / site-packages)
    3. Common fnm/nvm global bin directories
    """
    # Explicit override
    if os.environ.get("PI_COMMAND"):
        cmd = os.environ["PI_COMMAND"]
        return cmd if os.path.isfile(cmd) and os.access(cmd, os.X_OK) else None

    # Common non-venv locations first
    fnm_glob_patterns = [
        os.path.expanduser("~/.local/share/fnm/node-versions/*/installation/bin/pi"),
        os.path.expanduser("~/.nvm/versions/node/*/bin/pi"),
        "/usr/local/bin/pi",
    ]
    import glob as _glob
    for pattern in fnm_glob_patterns:
        for p in sorted(_glob.glob(pattern), reverse=True):  # newest version first
            if os.path.isfile(p) and os.access(p, os.X_OK):
                return p

    # Fallback: walk PATH, skip venv dirs
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    venv_dir = os.environ.get("VIRTUAL_ENV", "")
    for d in path_dirs:
        if venv_dir and d.startswith(venv_dir):
            continue
        if ".venv" in d or "site-packages" in d:
            continue
        candidate = os.path.join(d, "pi")
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            # Verify it's the pi coding agent (not a system utility)
            try:
                out = subprocess.check_output(
                    [candidate, "--version"], timeout=3, stderr=subprocess.STDOUT, text=True
                )
                # pi coding agent prints a semver like "0.66.1"
                if out.strip() and out.strip()[0].isdigit():
                    return candidate
            except Exception:
                pass
    return None


def check_pi_available() -> bool:
    """Return True if the pi coding agent CLI is available."""
    return find_pi_command() is not None


def _pi_agent_dir() -> Path:
    """Return PI's agent directory, respecting PI_CODING_AGENT_DIR env var."""
    return Path(os.environ.get("PI_CODING_AGENT_DIR") or os.path.expanduser("~/.pi/agent"))


def _pi_auth_path() -> Path:
    """Return the path to PI's auth.json."""
    return _pi_agent_dir() / "auth.json"


def _pi_settings_path() -> Path:
    """Return the path to PI's settings.json."""
    return _pi_agent_dir() / "settings.json"


def get_pi_enabled_models() -> Optional[set[str]]:
    """
    Return the set of enabled model specs from PI's settings.json, or None if
    no enabledModels list is configured (meaning all available models are allowed).

    Each entry is "provider/model_id" as written by `pi config`.
    """
    settings_path = _pi_settings_path()
    if not settings_path.exists():
        return None
    try:
        import json as _json
        settings = _json.loads(settings_path.read_text(encoding="utf-8"))
        enabled = settings.get("enabledModels")
        if isinstance(enabled, list) and enabled:
            return set(enabled)
    except Exception as exc:
        log.warning("Failed to read PI settings.json: %s", exc)
    return None


def get_active_providers() -> list[str]:
    """
    Return provider names that have credentials in PI's auth.json.

    A provider is active if it has any entry in auth.json — PI manages
    token refresh and validity at request time.  Providers the user has
    logged out of are simply absent from auth.json.
    """
    auth_path = _pi_auth_path()
    if not auth_path.exists():
        return []
    try:
        import json as _json
        auth = _json.loads(auth_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to read PI auth.json: %s", exc)
        return []
    return [p for p, cred in auth.items() if isinstance(cred, dict)]


def _get_provider_base_urls(pi_cmd: Optional[str] = None) -> dict[str, str]:
    """
    Read base URLs for all active providers from PI's model registry via Node.js.

    Returns {provider_name: base_url} for providers that have a baseUrl defined.
    Falls back to a hardcoded map of known providers if the Node.js call fails.
    """
    KNOWN_BASE_URLS: dict[str, str] = {
        "opencode":           "https://opencode.ai/zen",
        "opencode-go":        "https://opencode.ai/zen/go/v1",
        "openrouter":         "https://openrouter.ai/api/v1",
        "google-gemini-cli":  "https://generativelanguage.googleapis.com/v1beta/openai",
        "google-antigravity": "https://aiplatform.googleapis.com/v1",
    }

    cmd = pi_cmd or find_pi_command()
    if not cmd:
        return KNOWN_BASE_URLS

    # Ask Node.js to extract base URLs directly from PI's model registry
    node_script = r"""
const path = require('path');
const piDir = path.dirname(require.resolve('@mariozechner/pi-coding-agent/package.json'));
const { getProviders, getModels } = require(path.join(piDir, 'node_modules/@mariozechner/pi-ai/dist/models.generated.js'));
const result = {};
for (const p of getProviders()) {
    const models = getModels(p);
    if (models.length > 0 && models[0].baseUrl) {
        result[p] = models[0].baseUrl;
    }
}
console.log(JSON.stringify(result));
"""
    try:
        # Find node binary next to pi
        node_cmd = os.path.join(os.path.dirname(cmd), "node")
        if not os.path.isfile(node_cmd):
            node_cmd = "node"
        out = subprocess.check_output(
            [node_cmd, "-e", node_script],
            timeout=5, text=True, stderr=subprocess.DEVNULL,
        )
        parsed = json.loads(out.strip())
        if parsed:
            return {**KNOWN_BASE_URLS, **parsed}
    except Exception as exc:
        log.debug("_get_provider_base_urls() Node.js call failed: %s", exc)

    return KNOWN_BASE_URLS


def fetch_live_provider_models(
    provider: str,
    base_url: str,
    api_key: str,
    timeout: float = 8.0,
) -> Optional[list[dict]]:
    """
    Query a provider's OpenAI-compatible /v1/models endpoint.

    Returns a list of model dicts {provider, model} on success,
    or None if the endpoint is unavailable / returns an error.
    """
    # Normalise: strip trailing /v1 so we can append /v1/models cleanly
    url_base = base_url.rstrip("/")
    if url_base.endswith("/v1"):
        url_base = url_base[:-3]
    url = f"{url_base}/v1/models"

    try:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "pi-coding-agent/0.66.1",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        log.debug("fetch_live_provider_models(%s) HTTP %s: %s", provider, exc.code, url)
        return None
    except Exception as exc:
        log.debug("fetch_live_provider_models(%s) failed: %s", provider, exc)
        return None

    raw = data.get("data", data) if isinstance(data, dict) else data
    if not isinstance(raw, list):
        return None

    models = []
    for entry in raw:
        model_id = entry.get("id") if isinstance(entry, dict) else str(entry)
        if model_id:
            models.append({"provider": provider, "model": model_id})
    return models


def _get_api_key_for_provider(provider: str) -> Optional[str]:
    """Read the API key for a provider from PI's auth.json."""
    auth_path = _pi_auth_path()
    if not auth_path.exists():
        return None
    try:
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
        cred = auth.get(provider, {})
        return cred.get("key") or cred.get("access")
    except Exception:
        return None


def query_pi_models(pi_cmd: Optional[str] = None) -> list[dict]:
    """
    Return the models the user has active and scoped in PI.

    For each active provider:
      1. Query the provider's live /v1/models endpoint (OpenAI-compatible).
         This reflects the provider's actual catalogue — new models appear
         automatically without waiting for PI to update its static registry.
      2. Fall back to `pi --list-models` (PI's baked-in model list) for
         providers that don't expose /v1/models (OAuth providers, etc.).

    Then apply:
      - Filter by active providers (auth.json presence)
      - Filter by settings.json enabledModels allowlist (if present)

    Each entry: {provider, model}
    Live-sourced entries carry only provider + model; PI static entries also
    carry context_k / max_out_k / thinking / images metadata.

    Returns [] if PI is not installed or the command fails.
    """
    cmd = pi_cmd or find_pi_command()
    if not cmd:
        return []

    # Step 1: active providers from auth.json
    active_providers = set(get_active_providers())

    # Step 2: user-scoped model allowlist from settings.json (None = no restriction)
    enabled_set = get_pi_enabled_models()

    # Step 3: collect models per provider — live API first, PI static as fallback
    base_urls = _get_provider_base_urls(cmd)
    collected: list[dict] = []
    providers_covered_by_live: set[str] = set()

    for provider in active_providers:
        base_url = base_urls.get(provider)
        api_key = _get_api_key_for_provider(provider)
        if base_url and api_key:
            live = fetch_live_provider_models(provider, base_url, api_key)
            if live is not None:
                log.debug("Live models for %s: %d", provider, len(live))
                collected.extend(live)
                providers_covered_by_live.add(provider)
                continue
        log.debug("No live endpoint for %s — will use PI static list", provider)

    # Supplement with PI static list for providers not covered by live query
    providers_needing_static = active_providers - providers_covered_by_live
    if providers_needing_static:
        try:
            result = subprocess.run(
                [cmd, "--list-models"],
                timeout=10, capture_output=True, text=True,
            )
            for line in (result.stderr or result.stdout).splitlines():
                parts = line.split()
                if len(parts) < 2 or parts[0] == "provider":
                    continue
                if parts[0] not in providers_needing_static:
                    continue
                collected.append({
                    "provider": parts[0],
                    "model": parts[1],
                    "context_k": parts[2] if len(parts) > 2 else None,
                    "max_out_k": parts[3] if len(parts) > 3 else None,
                    "thinking": parts[4] == "yes" if len(parts) > 4 else False,
                    "images": parts[5] == "yes" if len(parts) > 5 else False,
                })
        except Exception as exc:
            log.warning("PI --list-models fallback failed: %s", exc)

    # Step 4: apply enabledModels filter
    if enabled_set is not None:
        collected = [
            m for m in collected
            if f"{m['provider']}/{m['model']}" in enabled_set
        ]

    # Deduplicate (same provider/model from both sources)
    seen: set[str] = set()
    models: list[dict] = []
    for m in collected:
        key = f"{m['provider']}/{m['model']}"
        if key not in seen:
            seen.add(key)
            models.append(m)

    return models


def _agent_definition_path(profile_id: str) -> Optional[Path]:
    """
    Resolve a PI agent definition file for a profile_id.

    Checks (in order):
      .pi/agents/<profile_id>.md              (project-local)
      ~/.pi/agent/agents/<profile_id>.md      (global user)
      src/pi_agent_os/pi_agents/<profile_id>.md (bundled stubs)
    """
    candidates = [
        Path(".pi/agents") / f"{profile_id}.md",
        Path.home() / ".pi" / "agent" / "agents" / f"{profile_id}.md",
        Path(__file__).parent.parent / "pi_agents" / f"{profile_id}.md",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _read_frontmatter(md_path: Path) -> dict:
    """Parse YAML frontmatter from a .md agent definition file."""
    try:
        import yaml  # pyyaml is in deps
        text = md_path.read_text(encoding="utf-8")
        if text.startswith("---"):
            end = text.index("---", 3)
            return yaml.safe_load(text[3:end]) or {}
    except Exception:
        pass
    return {}


def _extract_text(messages: list[dict]) -> str:
    """Extract plain text from PI message objects (spec §3.1 output)."""
    parts = []
    for msg in messages:
        if msg.get("role") == "assistant":
            for block in msg.get("content", []):
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block["text"])
                elif isinstance(block, str):
                    parts.append(block)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Per-run state
# ---------------------------------------------------------------------------

@dataclass
class _RunState:
    run_id: str
    proc: "subprocess.Popen[str]"
    reader_thread: threading.Thread
    events: list[dict] = field(default_factory=list)
    done: bool = False
    done_event: threading.Event = field(default_factory=threading.Event)
    error: Optional[str] = None
    final_messages: list[dict] = field(default_factory=list)
    # Failover support
    model_list: list[str] = field(default_factory=list)   # full ordered list incl. fallbacks
    model_index: int = 0                                   # currently active index
    config: Optional["PIAgentConfig"] = None               # stored for retry
    pi_cmd: str = "pi"                                     # stored for retry
    system_prompt: Optional[str] = None                    # stored for retry
    session_dir: Optional[str] = None                      # stored for retry
    tried_models: list[str] = field(default_factory=list)  # audit trail


# ---------------------------------------------------------------------------
# Bridge
# ---------------------------------------------------------------------------

class PIRPCBridge(PIRuntimeAdapter):
    """
    Real PIRuntimeAdapter — bridges to the PI CLI via `pi --mode rpc`.

    Each spawn_agent() call starts a dedicated subprocess.
    The protocol is event-streaming JSONL (not method-based JSON-RPC):
      stdin  → {"type": "prompt", "message": "..."}
      stdout ← {"type": "agent_start"} ... {"type": "agent_end", "messages": [...]}
    """

    def __init__(
        self,
        pi_command: str = "pi",
        provider: Optional[str] = None,
        default_model: Optional[str] = None,
        session_dir: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._pi_command = pi_command
        self._provider = provider          # None = use PI's configured default
        self._default_model = default_model  # None = use profile frontmatter or PI default
        self._session_dir = session_dir
        self._timeout = timeout
        self._runs: dict[str, _RunState] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # PIRuntimeAdapter interface
    # ------------------------------------------------------------------

    def spawn_agent(self, config: PIAgentConfig) -> str:
        """
        Spawn a new PI agent subprocess for the given config.

        Reads `models:` from the agent definition frontmatter as a
        comma-separated or YAML list of "provider/model" specs in priority
        order (primary first, then fallbacks).  Falls back to the `model:`
        field for single-model definitions.

        Returns a run_id immediately.  If the primary model returns an error
        the reader thread transparently retries with the next model in the list.
        Use wait_for_run() to block for the final result.
        """
        run_id = f"run_{uuid.uuid4().hex[:16]}"

        pi_cmd = (
            self._pi_command
            if self._pi_command != "pi"
            else (find_pi_command() or "pi")
        )

        # Resolve agent definition and frontmatter
        agent_def = _agent_definition_path(config.profile_id)
        fm = _read_frontmatter(agent_def) if agent_def else {}
        system_prompt: Optional[str] = str(fm["system"]) if fm.get("system") else None

        # Build ordered model list from frontmatter
        model_list = self._parse_model_list(fm, config)
        if not model_list:
            model_list = [""]  # let PI use its configured default

        # Start with the first model
        proc = self._start_proc(pi_cmd, model_list[0], system_prompt, config)

        state = _RunState(
            run_id=run_id,
            proc=proc,
            reader_thread=threading.Thread(target=lambda: None),
            model_list=model_list,
            model_index=0,
            config=config,
            pi_cmd=pi_cmd,
            system_prompt=system_prompt,
            session_dir=self._session_dir,
            tried_models=[model_list[0]],
        )
        state.reader_thread = threading.Thread(
            target=self._reader_loop,
            args=(run_id,),
            daemon=True,
            name=f"pi-reader-{run_id[:8]}",
        )

        with self._lock:
            self._runs[run_id] = state

        state.reader_thread.start()
        self._send_prompt(state, self._format_task(config))

        log.info(
            "Spawning PI agent: run_id=%s profile=%s model=%s fallbacks=%d",
            run_id, config.profile_id, model_list[0], len(model_list) - 1,
        )
        return run_id

    def get_run_status(self, run_id: str) -> dict:
        """Return a status snapshot for a run (no LLM call needed)."""
        state = self._get_state(run_id)
        base = {
            "run_id": run_id,
            "active_model": state.model_list[state.model_index] if state.model_list else None,
            "tried_models": list(state.tried_models),
            "fallbacks_remaining": len(state.model_list) - state.model_index - 1,
        }
        if state.error:
            return {**base, "status": "failed", "error": state.error}
        if state.done:
            return {**base, "status": "completed", "message_count": len(state.final_messages)}
        return {**base, "status": "running", "event_count": len(state.events)}

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        """Block until the PI agent run completes or times out."""
        state = self._get_state(run_id)
        deadline = timeout if timeout is not None else self._timeout
        completed = state.done_event.wait(timeout=deadline)

        if not completed:
            try:
                self._send_command(state, {"type": "abort"})
                time.sleep(1)
                state.proc.terminate()
            except Exception:
                pass
            return PIRunResult(
                run_id=run_id,
                status="failed",
                output={},
                error=f"Timeout after {deadline}s",
            )

        if state.error:
            return PIRunResult(
                run_id=run_id, status="failed", output={}, error=state.error,
            )

        output_text = _extract_text(state.final_messages)
        return PIRunResult(
            run_id=run_id,
            status="completed",
            output={"text": output_text, "messages": state.final_messages},
        )

    def list_profiles(self) -> list[dict]:
        """List available PI agent profiles from .md definition files."""
        profiles: list[dict] = []
        seen: set[str] = set()
        search_dirs = [
            Path(".pi/agents"),
            Path.home() / ".pi" / "agent" / "agents",
            Path(__file__).parent.parent / "pi_agents",
        ]
        for d in search_dirs:
            if d.is_dir():
                for md in sorted(d.glob("*.md")):
                    name = md.stem
                    if name in seen or name in ("README",):
                        continue
                    seen.add(name)
                    fm = _read_frontmatter(md)
                    raw_model = fm.get("model") or self._default_model or "pi-default"
                    raw_provider = fm.get("provider") or self._provider
                    # Parse inline provider/model format
                    if "/" in str(raw_model):
                        inline_provider, inline_model = str(raw_model).split("/", 1)
                    else:
                        inline_provider, inline_model = raw_provider, raw_model
                    profiles.append({
                        "profile_id": name,
                        "provider": inline_provider or "pi-default",
                        "model": inline_model,
                        "model_spec": str(raw_model),  # full "provider/model" or just "model"
                        "source": str(md),
                    })
        return profiles

    def get_profile(self, profile_id: str) -> Optional[dict]:
        for p in self.list_profiles():
            if p["profile_id"] == profile_id:
                return p
        return None

    def query_models(self) -> list[dict]:
        """
        Return all models available in the local PI installation.

        Dynamically queries `pi --list-models` — reflects whatever providers
        and models the user has configured (API keys, extensions, etc.).
        Each entry: {provider, model, context_k, max_out_k, thinking, images}
        """
        pi_cmd = (
            self._pi_command
            if self._pi_command != "pi"
            else (find_pi_command() or "pi")
        )
        return query_pi_models(pi_cmd)

    def models_for_provider(self, provider: str) -> list[dict]:
        """Return all models for a specific provider."""
        return [m for m in self.query_models() if m["provider"] == provider]

    def providers(self) -> list[str]:
        """Return active providers (logged-in, from auth.json)."""
        return get_active_providers()

    def scoped_providers(self) -> list[str]:
        """Return providers that have at least one model in the active+scoped set."""
        seen: list[str] = []
        for m in self.query_models():
            if m["provider"] not in seen:
                seen.append(m["provider"])
        return seen

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        """
        Invoke a team by spawning a Chief of Staff agent.

        The pi-subagents extension (@tintinweb/pi-subagents) must be installed
        for the COS agent to itself use the Agent tool to spawn specialists.
        """
        config = PIAgentConfig(
            profile_id="chief_of_staff",
            task_packet={
                **task_packet,
                "_team_template": template_id,
                "_instruction": (
                    f"You are orchestrating a team using template '{template_id}'. "
                    "Use the Agent tool (from pi-subagents) to spawn specialist "
                    f"sub-agents as needed. Task context: {json.dumps(task_packet)}"
                ),
            },
        )
        return self.spawn_agent(config)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_state(self, run_id: str) -> _RunState:
        with self._lock:
            state = self._runs.get(run_id)
        if state is None:
            raise KeyError(f"Unknown run_id: {run_id!r}")
        return state

    def _send_command(self, state: _RunState, cmd: dict) -> None:
        """Write a JSONL command to the subprocess stdin."""
        line = json.dumps(cmd) + "\n"
        try:
            assert state.proc.stdin is not None
            state.proc.stdin.write(line)
            state.proc.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            log.warning("Failed to send command to run %s: %s", state.run_id[:8], exc)

    def _send_prompt(self, state: _RunState, message: str) -> None:
        req_id = uuid.uuid4().hex[:8]
        self._send_command(state, {"id": req_id, "type": "prompt", "message": message})

    def _reader_loop(self, run_id: str) -> None:
        """Background daemon thread: read JSONL events from the PI subprocess."""
        state = self._get_state(run_id)
        try:
            assert state.proc.stdout is not None
            for raw_line in state.proc.stdout:
                line = raw_line.rstrip("\r\n")
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    log.debug("PI non-JSON stdout [%s]: %s", run_id[:8], line[:120])
                    continue

                state.events.append(event)
                evt_type = event.get("type", "")

                if evt_type == "agent_end":
                    state.final_messages = event.get("messages", [])
                    state.done = True
                    state.done_event.set()
                    log.info(
                        "PI run %s completed (%d messages) via %s",
                        run_id[:8], len(state.final_messages),
                        state.model_list[state.model_index] if state.model_list else "?",
                    )

                elif evt_type == "error":
                    reason = event.get("reason", "error")
                    # User-initiated abort: don't failover, surface immediately
                    if reason == "aborted":
                        state.error = "aborted"
                        state.done = True
                        state.done_event.set()
                        return
                    # Model/provider error: try next model in failover list
                    err_msg = f"PI error ({reason}): {event.get('error', 'unknown')}"
                    log.warning("PI run %s model error: %s", run_id[:8], err_msg)
                    if self._try_failover(state, err_msg):
                        return  # new reader thread takes over
                    state.error = err_msg
                    state.done = True
                    state.done_event.set()

                elif evt_type == "message_update":
                    ae = event.get("assistantMessageEvent", {})
                    if ae.get("type") == "text_delta":
                        log.debug("PI[%s] %s", run_id[:8], ae.get("delta", ""))

        except Exception as exc:
            log.warning("PI reader loop exception for %s: %s", run_id[:8], exc)
            if not state.done:
                if self._try_failover(state, str(exc)):
                    return
                state.error = str(exc)
                state.done = True
                state.done_event.set()
        finally:
            try:
                assert state.proc.stderr is not None
                state.proc.stderr.read()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Failover helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_model_list(fm: dict, config: "PIAgentConfig") -> list[str]:
        """
        Build an ordered model list from agent frontmatter.

        Frontmatter field `models:` (preferred) accepts:
          - CSV string:  "opencode/claude-sonnet-4-6, openai-codex/gpt-5.4"
          - YAML list:   ["opencode/claude-sonnet-4-6", "openai-codex/gpt-5.4"]

        If `models:` is absent, falls back to `model:` as a single entry.
        Task packet `_models` list may also provide overrides (highest priority).
        """
        # Caller override via task packet (highest priority)
        tp_models = config.task_packet.get("_models") if isinstance(config.task_packet, dict) else None
        if tp_models:
            if isinstance(tp_models, str):
                return [m.strip() for m in tp_models.split(",") if m.strip()]
            if isinstance(tp_models, list):
                return [str(m).strip() for m in tp_models if str(m).strip()]

        # Frontmatter `models:` field
        raw = fm.get("models")
        if raw:
            if isinstance(raw, str):
                return [m.strip() for m in raw.split(",") if m.strip()]
            if isinstance(raw, list):
                return [str(m).strip() for m in raw if str(m).strip()]

        # Frontmatter `model:` single field
        single = fm.get("model")
        if single:
            return [str(single).strip()]

        return []

    def _start_proc(
        self,
        pi_cmd: str,
        model_spec: str,
        system_prompt: Optional[str],
        config: "PIAgentConfig",
    ) -> "subprocess.Popen[str]":
        """Start a PI subprocess with the given model spec."""
        cmd = [pi_cmd, "--mode", "rpc"]

        if model_spec:
            if "/" in model_spec:
                cmd += ["--model", model_spec]
            else:
                if self._provider:
                    cmd += ["--provider", self._provider]
                cmd += ["--model", model_spec]
        elif self._provider:
            cmd += ["--provider", self._provider]

        if system_prompt:
            cmd += ["--system-prompt", system_prompt]

        cmd += ["--no-session"]
        if self._session_dir:
            cmd += ["--session-dir", self._session_dir]

        cwd = config.worktree_path or os.getcwd()
        try:
            return subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"PI CLI not found: {pi_cmd!r}. "
                "Install with: npm install -g @mariozechner/pi-coding-agent"
            )

    def _try_failover(self, state: _RunState, prev_error: str) -> bool:
        """
        Attempt to continue a failed run with the next model in the fallback list.

        Kills the current subprocess, starts a new one with the next model,
        records the attempt in state.tried_models, and spawns a new reader thread.
        Returns True if a retry was started; False if all models are exhausted.
        """
        next_idx = state.model_index + 1
        if next_idx >= len(state.model_list):
            all_tried = ", ".join(state.tried_models)
            log.warning(
                "PI run %s: all %d models exhausted (%s). Last error: %s",
                state.run_id[:8], len(state.model_list), all_tried, prev_error,
            )
            return False

        state.model_index = next_idx
        next_model = state.model_list[next_idx]
        state.tried_models.append(next_model)

        log.info(
            "PI run %s failover → %s (attempt %d/%d)",
            state.run_id[:8], next_model, next_idx + 1, len(state.model_list),
        )

        # Drain and terminate old process
        try:
            state.proc.stdin.close()  # type: ignore[union-attr]
        except Exception:
            pass
        try:
            state.proc.terminate()
            state.proc.wait(timeout=3)
        except Exception:
            pass

        # Start new subprocess
        assert state.config is not None
        try:
            new_proc = self._start_proc(
                state.pi_cmd, next_model, state.system_prompt, state.config
            )
        except Exception as exc:
            log.warning("PI failover spawn failed for %s: %s", next_model, exc)
            return False

        state.proc = new_proc
        state.events.append({
            "type": "failover",
            "from": state.model_list[next_idx - 1],
            "to": next_model,
            "reason": prev_error,
        })

        # Start new reader thread
        new_thread = threading.Thread(
            target=self._reader_loop,
            args=(state.run_id,),
            daemon=True,
            name=f"pi-reader-{state.run_id[:8]}-try{next_idx}",
        )
        state.reader_thread = new_thread
        new_thread.start()

        # Re-send the original task to the new process
        self._send_prompt(state, self._format_task(state.config))
        return True

    @staticmethod
    def _format_task(config: PIAgentConfig) -> str:
        """Convert a PIAgentConfig task_packet into a markdown prompt."""
        tp = config.task_packet
        if isinstance(tp, str):
            return tp
        if tp.get("_instruction"):
            return str(tp["_instruction"])
        parts: list[str] = []
        if tp.get("title"):
            parts.append(f"## Task: {tp['title']}")
        if tp.get("description"):
            parts.append(str(tp["description"]))
        if tp.get("acceptance_criteria"):
            parts.append(f"\n**Acceptance criteria:** {tp['acceptance_criteria']}")
        if not parts:
            parts.append(json.dumps(tp, indent=2))
        return "\n\n".join(parts)

    def close(self) -> None:
        """Terminate all running subprocesses."""
        with self._lock:
            run_ids = list(self._runs.keys())
        for rid in run_ids:
            try:
                state = self._runs[rid]
                if not state.done:
                    state.proc.terminate()
            except Exception:
                pass

    def __enter__(self) -> "PIRPCBridge":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
