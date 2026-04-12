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


def get_enabled_providers() -> list[str]:
    """
    Return provider names that have valid (non-expired) credentials in PI's auth.json.

    Rules:
    - api_key providers: always valid as long as the entry exists
    - oauth providers: valid only if the 'expires' timestamp (ms epoch) is in the future

    This is stricter than PI's own `hasAuth()` which only checks for presence.
    Use this to filter out providers with expired OAuth tokens.
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

    now_ms = time.time() * 1000
    enabled: list[str] = []
    for provider, cred in auth.items():
        if not isinstance(cred, dict):
            continue
        cred_type = cred.get("type", "")
        if cred_type == "api_key":
            if cred.get("key"):
                enabled.append(provider)
        elif cred_type == "oauth":
            expires = cred.get("expires", 0)
            if isinstance(expires, (int, float)) and expires > now_ms:
                enabled.append(provider)
        # unknown type: skip (conservative)
    return enabled


def query_pi_models(pi_cmd: Optional[str] = None) -> list[dict]:
    """
    Return the models the user has scoped in PI.

    Two-step filter (mirrors PI's own logic):
    1. `pi --list-models` — providers with auth configured (PI's getAvailable())
    2. settings.json `enabledModels` — the explicit allowlist set via `pi config`
       If enabledModels is absent, all available models are returned.

    Each entry: {provider, model, context_k, max_out_k, thinking, images}

    Returns [] if PI is not installed or the command fails.
    """
    cmd = pi_cmd or find_pi_command()
    if not cmd:
        return []
    try:
        # PI writes --list-models output to stderr (it's a TUI-style render)
        result = subprocess.run(
            [cmd, "--list-models"],
            timeout=10,
            capture_output=True,
            text=True,
        )
        out = result.stderr or result.stdout
    except Exception as exc:
        log.warning("query_pi_models() failed: %s", exc)
        return []

    # None = no allowlist, all models pass; set = only these "provider/model" specs
    enabled_set = get_pi_enabled_models()

    models: list[dict] = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 2 or parts[0] == "provider":
            continue
        provider, model_id = parts[0], parts[1]
        if enabled_set is not None and f"{provider}/{model_id}" not in enabled_set:
            continue
        models.append({
            "provider": provider,
            "model": model_id,
            "context_k": parts[2] if len(parts) > 2 else None,
            "max_out_k": parts[3] if len(parts) > 3 else None,
            "thinking": parts[4] == "yes" if len(parts) > 4 else False,
            "images": parts[5] == "yes" if len(parts) > 5 else False,
        })
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

        Returns a run_id that can be passed to get_run_status / wait_for_run.
        The subprocess runs asynchronously; use wait_for_run() to collect results.
        """
        run_id = f"run_{uuid.uuid4().hex[:16]}"

        # Build CLI args — omit --provider and --model if not specified,
        # letting PI use whatever the user has configured interactively.
        pi_cmd = (
            self._pi_command
            if self._pi_command != "pi"
            else (find_pi_command() or "pi")
        )
        cmd = [pi_cmd, "--mode", "rpc"]

        # Model + system prompt: profile frontmatter → caller override → PI default
        # Supports two formats:
        #   "provider/model_id"  → passed as --model provider/model_id (PI resolves provider)
        #   "model_id"           → passed as --model model_id with optional --provider
        # Frontmatter can also set `provider:` separately (lower precedence than inline prefix).
        model: Optional[str] = self._default_model
        provider: Optional[str] = self._provider
        agent_def = _agent_definition_path(config.profile_id)
        system_prompt: Optional[str] = None

        if agent_def:
            fm = _read_frontmatter(agent_def)
            if fm.get("model") and not model:
                model = str(fm["model"])
            if fm.get("provider") and not provider:
                provider = str(fm["provider"])
            if fm.get("system"):
                system_prompt = str(fm["system"])

        if model:
            if "/" in model:
                # "provider/model_id" — PI handles both in one --model flag
                cmd += ["--model", model]
            else:
                if provider:
                    cmd += ["--provider", provider]
                cmd += ["--model", model]
        elif provider:
            cmd += ["--provider", provider]

        if system_prompt:
            cmd += ["--system-prompt", system_prompt]

        # No session persistence for spawned agents
        cmd += ["--no-session"]
        if self._session_dir:
            cmd += ["--session-dir", self._session_dir]

        cwd = config.worktree_path or os.getcwd()

        log.info(
            "Spawning PI agent: run_id=%s profile=%s model=%s",
            run_id, config.profile_id, model,
        )

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=cwd,
                text=True,
                bufsize=1,  # line-buffered
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"PI CLI not found: {self._pi_command!r}. "
                "Install with: npm install -g @mariozechner/pi-coding-agent"
            )

        # Build state first so reader thread can reference it
        state = _RunState(
            run_id=run_id,
            proc=proc,
            reader_thread=threading.Thread(target=lambda: None),  # placeholder
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

        # Send the task as the first prompt
        self._send_prompt(state, self._format_task(config))
        return run_id

    def get_run_status(self, run_id: str) -> dict:
        """Return a status snapshot for a run (no LLM call needed)."""
        state = self._get_state(run_id)
        if state.error:
            return {"run_id": run_id, "status": "failed", "error": state.error}
        if state.done:
            return {
                "run_id": run_id,
                "status": "completed",
                "message_count": len(state.final_messages),
            }
        return {
            "run_id": run_id,
            "status": "running",
            "event_count": len(state.events),
        }

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
        """Return the deduplicated list of providers available in PI."""
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
                        "PI run %s completed (%d messages)",
                        run_id[:8], len(state.final_messages),
                    )

                elif evt_type == "error":
                    reason = event.get("reason", "error")
                    state.error = (
                        f"PI error ({reason}): {event.get('error', 'unknown')}"
                    )
                    state.done = True
                    state.done_event.set()
                    log.warning("PI run %s error: %s", run_id[:8], state.error)

                elif evt_type == "message_update":
                    ae = event.get("assistantMessageEvent", {})
                    if ae.get("type") == "text_delta":
                        log.debug("PI[%s] %s", run_id[:8], ae.get("delta", ""))

        except Exception as exc:
            log.warning("PI reader loop exception for %s: %s", run_id[:8], exc)
            if not state.done:
                state.error = str(exc)
                state.done = True
                state.done_event.set()
        finally:
            try:
                assert state.proc.stderr is not None
                state.proc.stderr.read()
            except Exception:
                pass

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
