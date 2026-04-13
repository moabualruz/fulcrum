"""
CLI Chat Adapters — use official AI CLI tools as chat providers.

Treats `claude` (Claude Code CLI) and `gemini` (Gemini CLI) as simple
chat backends: send a prompt with a custom system prompt, get text back.
No interactive TUI, no tool execution, no session persistence.

Model spec format in agent .md frontmatter:
    models: claude-cli/claude-sonnet-4-6, claude-cli/claude-haiku-4-5
    models: gemini-cli/gemini-2.5-pro, gemini-cli/gemini-2.0-flash

Provider prefixes recognised:
    claude-cli  →  claude --print --output-format json ...
    gemini-cli  →  gemini --prompt ... --output-format json ...

Auth:
    claude-cli  Uses Claude Code's existing OAuth session (no API key needed).
    gemini-cli  Requires prior `gemini` browser login or GEMINI_API_KEY env var.
                Run `gemini` once interactively to complete OAuth, then non-
                interactive mode will reuse the saved credentials.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .pi_adapter import PIAgentConfig, PIRunResult, PIRuntimeAdapter
from .pi_rpc_bridge import (
    _agent_definition_path,
    _read_frontmatter,
    PIRPCBridge,
)

log = logging.getLogger(__name__)

# Provider prefix → (cli_binary, adapter_class_factory)
CLI_PROVIDERS = ("claude-cli", "gemini-cli")


def is_cli_model_spec(model_spec: str) -> bool:
    """Return True if model_spec uses a CLI provider prefix."""
    return any(model_spec.startswith(f"{p}/") for p in CLI_PROVIDERS)


def find_claude_command() -> Optional[str]:
    """Find the claude CLI binary."""
    if os.environ.get("CLAUDE_COMMAND"):
        return os.environ["CLAUDE_COMMAND"]
    for candidate in [
        os.path.expanduser("~/.local/bin/claude"),
        "/usr/local/bin/claude",
    ]:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    import shutil
    return shutil.which("claude")


def find_gemini_command() -> Optional[str]:
    """Find the gemini CLI binary."""
    if os.environ.get("GEMINI_COMMAND"):
        return os.environ["GEMINI_COMMAND"]
    import glob as _glob
    for pattern in [
        os.path.expanduser("~/.nvm/versions/node/*/bin/gemini"),
        os.path.expanduser("~/.local/share/fnm/node-versions/*/installation/bin/gemini"),
    ]:
        for p in sorted(_glob.glob(pattern), reverse=True):
            if os.path.isfile(p) and os.access(p, os.X_OK):
                return p
    import shutil
    return shutil.which("gemini")


# ---------------------------------------------------------------------------
# Per-run state
# ---------------------------------------------------------------------------

@dataclass
class _CliRunState:
    run_id: str
    proc: "subprocess.Popen[str]"
    thread: threading.Thread
    done: bool = False
    done_event: threading.Event = field(default_factory=threading.Event)
    error: Optional[str] = None
    result_text: str = ""
    raw_output: str = ""
    model: str = ""
    profile_id: str = ""


# ---------------------------------------------------------------------------
# Claude CLI adapter
# ---------------------------------------------------------------------------

class ClaudeCLIAdapter(PIRuntimeAdapter):
    """
    Runs `claude --print --output-format json` as a stateless chat provider.

    Uses the user's existing Claude Code OAuth session — no API key required.
    The system prompt from the agent .md frontmatter replaces the default
    Claude Code system prompt entirely, giving clean role-scoped behaviour.

    Model spec:  claude-cli/<model>
    Example:     claude-cli/claude-sonnet-4-6
    """

    def __init__(
        self,
        default_model: str = "claude-sonnet-4-6",
        claude_cmd: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._default_model = default_model
        self._claude_cmd = claude_cmd or find_claude_command() or "claude"
        self._timeout = timeout
        self._runs: dict[str, _CliRunState] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # PIRuntimeAdapter interface
    # ------------------------------------------------------------------

    def spawn_agent(self, config: PIAgentConfig) -> str:
        run_id = f"run_{uuid.uuid4().hex[:16]}"

        agent_def = _agent_definition_path(config.profile_id)
        fm = _read_frontmatter(agent_def) if agent_def else {}
        system_prompt: Optional[str] = str(fm["system"]) if fm.get("system") else None

        model = self._resolve_model(fm, config)
        task = PIRPCBridge._format_task(config)

        cmd = [
            self._claude_cmd,
            "--print",
            "--output-format", "json",
            "--no-session-persistence",
            "--model", model,
        ]
        if system_prompt:
            cmd += ["--system-prompt", system_prompt]
        cmd.append(task)

        log.info("ClaudeCLI spawn: run=%s model=%s", run_id[:8], model)

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"claude CLI not found: {self._claude_cmd!r}. "
                "Install Claude Code: https://claude.ai/code"
            )

        state = _CliRunState(
            run_id=run_id,
            proc=proc,
            thread=threading.Thread(target=lambda: None),
        )
        state.model = model
        state.profile_id = config.profile_id
        state.thread = threading.Thread(
            target=self._reader,
            args=(run_id,),
            daemon=True,
            name=f"claude-cli-{run_id[:8]}",
        )

        with self._lock:
            self._runs[run_id] = state

        state.thread.start()
        return run_id

    def get_run_status(self, run_id: str) -> dict:
        state = self._get_state(run_id)
        if state.error:
            return {"run_id": run_id, "status": "failed", "error": state.error}
        if state.done:
            return {"run_id": run_id, "status": "completed", "result_length": len(state.result_text)}
        return {"run_id": run_id, "status": "running"}

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        state = self._get_state(run_id)
        try:
            from ..telemetry.spans import agent_span
            with agent_span(
                provider="anthropic",
                model=getattr(state, "model", self._default_model),
                profile=getattr(state, "profile_id", "unknown"),
            ) as s:
                s.set_run_id(run_id)
                result = self._wait_inner(run_id, state, timeout)
                if result.status != "completed":
                    s.set_error(result.error or "run failed")
                return result
        except ImportError:
            return self._wait_inner(run_id, state, timeout)

    def _wait_inner(self, run_id: str, state: _CliRunState, timeout: float | None = None) -> PIRunResult:
        deadline = timeout if timeout is not None else self._timeout
        completed = state.done_event.wait(timeout=deadline)

        if not completed:
            try:
                state.proc.terminate()
            except Exception:
                pass
            return PIRunResult(
                run_id=run_id, status="failed", output={},
                error=f"Timeout after {deadline}s",
            )

        if state.error:
            return PIRunResult(
                run_id=run_id, status="failed", output={}, error=state.error,
            )

        return PIRunResult(
            run_id=run_id,
            status="completed",
            output={"text": state.result_text, "raw": state.raw_output},
        )

    def list_profiles(self) -> list[dict]:
        return _list_cli_profiles("claude-cli")

    def get_profile(self, profile_id: str) -> Optional[dict]:
        for p in self.list_profiles():
            if p["profile_id"] == profile_id:
                return p
        return None

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        config = PIAgentConfig(
            profile_id="chief_of_staff",
            task_packet={
                **task_packet,
                "_team_template": template_id,
                "_instruction": (
                    f"Orchestrate team '{template_id}'. "
                    f"Task: {json.dumps(task_packet)}"
                ),
            },
        )
        return self.spawn_agent(config)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_state(self, run_id: str) -> _CliRunState:
        with self._lock:
            state = self._runs.get(run_id)
        if state is None:
            raise KeyError(f"Unknown run_id: {run_id!r}")
        return state

    def _resolve_model(self, fm: dict, config: PIAgentConfig) -> str:
        """Pick the first model spec, strip 'claude-cli/' prefix."""
        # Task packet override
        tp_models = (config.task_packet or {}).get("_models") if isinstance(config.task_packet, dict) else None
        if tp_models:
            specs = [tp_models] if isinstance(tp_models, str) else tp_models
            for spec in specs:
                m = _strip_cli_prefix(str(spec), "claude-cli")
                if m:
                    return m

        # Frontmatter models: CSV or list
        raw = fm.get("models") or fm.get("model")
        if raw:
            specs = raw.split(",") if isinstance(raw, str) else raw
            for spec in specs:
                m = _strip_cli_prefix(str(spec).strip(), "claude-cli")
                if m:
                    return m
            # Fallback: use first entry even without prefix
            first = str(specs[0]).strip() if specs else ""
            if first and "/" not in first:
                return first

        return self._default_model

    def _reader(self, run_id: str) -> None:
        state = self._get_state(run_id)
        try:
            stdout, stderr = state.proc.communicate(timeout=self._timeout)
            state.raw_output = stdout

            if not stdout.strip():
                state.error = stderr.strip() or "claude CLI produced no output"
                state.done = True
                state.done_event.set()
                return

            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                # Plain text fallback (shouldn't happen with --output-format json)
                state.result_text = stdout.strip()
                state.done = True
                state.done_event.set()
                return

            if data.get("is_error") or data.get("subtype") == "error":
                state.error = data.get("result") or str(data)
                state.done = True
                state.done_event.set()
                return

            state.result_text = data.get("result", "")
            state.done = True
            state.done_event.set()
            log.info(
                "ClaudeCLI run %s completed (%d chars, cost=$%.4f)",
                run_id[:8], len(state.result_text),
                data.get("total_cost_usd", 0),
            )

        except subprocess.TimeoutExpired:
            state.proc.kill()
            state.error = f"claude CLI timeout after {self._timeout}s"
            state.done = True
            state.done_event.set()
        except Exception as exc:
            state.error = str(exc)
            state.done = True
            state.done_event.set()


# ---------------------------------------------------------------------------
# Gemini CLI adapter
# ---------------------------------------------------------------------------

class GeminiCLIAdapter(PIRuntimeAdapter):
    """
    Runs `gemini --prompt ... --output-format json` as a stateless chat provider.

    Requires a prior interactive `gemini` login (OAuth) or GEMINI_API_KEY env var.
    System prompt is injected as a <system> block prefix in the user message
    (Gemini CLI has no dedicated --system-prompt flag).

    Model spec:  gemini-cli/<model>
    Example:     gemini-cli/gemini-2.5-pro
    """

    def __init__(
        self,
        default_model: str = "gemini-2.5-pro",
        gemini_cmd: Optional[str] = None,
        timeout: float = 300.0,
    ):
        self._default_model = default_model
        self._gemini_cmd = gemini_cmd or find_gemini_command() or "gemini"
        self._timeout = timeout
        self._runs: dict[str, _CliRunState] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # PIRuntimeAdapter interface
    # ------------------------------------------------------------------

    def spawn_agent(self, config: PIAgentConfig) -> str:
        run_id = f"run_{uuid.uuid4().hex[:16]}"

        agent_def = _agent_definition_path(config.profile_id)
        fm = _read_frontmatter(agent_def) if agent_def else {}
        system_prompt: Optional[str] = str(fm["system"]) if fm.get("system") else None

        model = self._resolve_model(fm, config)
        task = PIRPCBridge._format_task(config)

        # Gemini has no --system-prompt flag; inject as a prefixed block
        if system_prompt:
            full_prompt = f"<system>\n{system_prompt}\n</system>\n\n{task}"
        else:
            full_prompt = task

        cmd = [
            self._gemini_cmd,
            "--prompt", full_prompt,
            "--output-format", "json",
            "--yolo",           # auto-approve any tool confirmations
        ]
        if model:
            cmd += ["--model", model]

        log.info("GeminiCLI spawn: run=%s model=%s", run_id[:8], model)

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"gemini CLI not found: {self._gemini_cmd!r}. "
                "Install: npm install -g @google/gemini-cli"
            )

        state = _CliRunState(
            run_id=run_id,
            proc=proc,
            thread=threading.Thread(target=lambda: None),
        )
        state.model = model
        state.profile_id = config.profile_id
        state.thread = threading.Thread(
            target=self._reader,
            args=(run_id,),
            daemon=True,
            name=f"gemini-cli-{run_id[:8]}",
        )

        with self._lock:
            self._runs[run_id] = state

        state.thread.start()
        return run_id

    def get_run_status(self, run_id: str) -> dict:
        state = self._get_state(run_id)
        if state.error:
            return {"run_id": run_id, "status": "failed", "error": state.error}
        if state.done:
            return {"run_id": run_id, "status": "completed", "result_length": len(state.result_text)}
        return {"run_id": run_id, "status": "running"}

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        state = self._get_state(run_id)
        try:
            from ..telemetry.spans import agent_span
            with agent_span(
                provider="google_gemini",
                model=getattr(state, "model", self._default_model),
                profile=getattr(state, "profile_id", "unknown"),
            ) as s:
                s.set_run_id(run_id)
                result = self._wait_inner(run_id, state, timeout)
                if result.status != "completed":
                    s.set_error(result.error or "run failed")
                return result
        except ImportError:
            return self._wait_inner(run_id, state, timeout)

    def _wait_inner(self, run_id: str, state: _CliRunState, timeout: float | None = None) -> PIRunResult:
        deadline = timeout if timeout is not None else self._timeout
        completed = state.done_event.wait(timeout=deadline)

        if not completed:
            try:
                state.proc.terminate()
            except Exception:
                pass
            return PIRunResult(
                run_id=run_id, status="failed", output={},
                error=f"Timeout after {deadline}s",
            )

        if state.error:
            return PIRunResult(
                run_id=run_id, status="failed", output={}, error=state.error,
            )

        return PIRunResult(
            run_id=run_id,
            status="completed",
            output={"text": state.result_text, "raw": state.raw_output},
        )

    def list_profiles(self) -> list[dict]:
        return _list_cli_profiles("gemini-cli")

    def get_profile(self, profile_id: str) -> Optional[dict]:
        for p in self.list_profiles():
            if p["profile_id"] == profile_id:
                return p
        return None

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        config = PIAgentConfig(
            profile_id="chief_of_staff",
            task_packet={
                **task_packet,
                "_team_template": template_id,
                "_instruction": (
                    f"Orchestrate team '{template_id}'. "
                    f"Task: {json.dumps(task_packet)}"
                ),
            },
        )
        return self.spawn_agent(config)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_state(self, run_id: str) -> _CliRunState:
        with self._lock:
            state = self._runs.get(run_id)
        if state is None:
            raise KeyError(f"Unknown run_id: {run_id!r}")
        return state

    def _resolve_model(self, fm: dict, config: PIAgentConfig) -> str:
        tp_models = (config.task_packet or {}).get("_models") if isinstance(config.task_packet, dict) else None
        if tp_models:
            specs = [tp_models] if isinstance(tp_models, str) else tp_models
            for spec in specs:
                m = _strip_cli_prefix(str(spec), "gemini-cli")
                if m:
                    return m

        raw = fm.get("models") or fm.get("model")
        if raw:
            specs = raw.split(",") if isinstance(raw, str) else raw
            for spec in specs:
                m = _strip_cli_prefix(str(spec).strip(), "gemini-cli")
                if m:
                    return m

        return self._default_model

    def _reader(self, run_id: str) -> None:
        state = self._get_state(run_id)
        try:
            stdout, stderr = state.proc.communicate(timeout=self._timeout)
            state.raw_output = stdout

            combined = stdout.strip() or stderr.strip()
            if not combined:
                state.error = "gemini CLI produced no output"
                state.done = True
                state.done_event.set()
                return

            # gemini --output-format json wraps the response in a JSON envelope
            try:
                data = json.loads(stdout)
                # Gemini JSON output: {"response": "...", ...} or list of events
                if isinstance(data, dict):
                    text = (
                        data.get("response")
                        or data.get("text")
                        or data.get("result")
                        or str(data)
                    )
                elif isinstance(data, list):
                    # stream-json style: find last assistant message
                    texts = []
                    for evt in data:
                        if isinstance(evt, dict) and evt.get("role") == "model":
                            for part in evt.get("parts", []):
                                if isinstance(part, dict) and part.get("text"):
                                    texts.append(part["text"])
                    text = "\n".join(texts) or str(data)
                else:
                    text = str(data)
                state.result_text = text
            except json.JSONDecodeError:
                # Fall back to raw text
                state.result_text = stdout.strip() or stderr.strip()

            state.done = True
            state.done_event.set()
            log.info("GeminiCLI run %s completed (%d chars)", run_id[:8], len(state.result_text))

        except subprocess.TimeoutExpired:
            state.proc.kill()
            state.error = f"gemini CLI timeout after {self._timeout}s"
            state.done = True
            state.done_event.set()
        except Exception as exc:
            state.error = str(exc)
            state.done = True
            state.done_event.set()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _strip_cli_prefix(spec: str, provider: str) -> Optional[str]:
    """Strip 'provider/' prefix and return the model name, or None if not matching."""
    prefix = f"{provider}/"
    if spec.startswith(prefix):
        return spec[len(prefix):]
    return None


def _list_cli_profiles(provider_prefix: str) -> list[dict]:
    """List agent profiles that have at least one model spec for this CLI provider."""
    from .pi_rpc_bridge import _agent_definition_path
    profiles = []
    search_dirs = [
        Path(".pi/agents"),
        Path.home() / ".pi" / "agent" / "agents",
        Path(__file__).parent.parent / "pi_agents",
    ]
    seen: set[str] = set()
    for d in search_dirs:
        if d.is_dir():
            for md in sorted(d.glob("*.md")):
                name = md.stem
                if name in seen or name == "README":
                    continue
                fm = _read_frontmatter(md)
                raw = fm.get("models") or fm.get("model") or ""
                specs = raw.split(",") if isinstance(raw, str) else (raw or [])
                if any(str(s).strip().startswith(f"{provider_prefix}/") for s in specs):
                    seen.add(name)
                    profiles.append({
                        "profile_id": name,
                        "provider": provider_prefix,
                        "source": str(md),
                    })
    return profiles


# ---------------------------------------------------------------------------
# Routing adapter — dispatches based on model spec prefix
# ---------------------------------------------------------------------------

class RoutingAdapter(PIRuntimeAdapter):
    """
    Composite adapter that routes spawn_agent() calls to the right backend
    based on the first model spec in the agent's frontmatter `models:` field.

    Priority order:
      claude-cli/*  → ClaudeCLIAdapter
      gemini-cli/*  → GeminiCLIAdapter
      (anything else) → fallback adapter (PIRPCBridge by default)

    This lets you mix providers across agent roles by setting `models:` in
    each agent's .md file.
    """

    def __init__(
        self,
        fallback: PIRuntimeAdapter,
        claude_adapter: Optional[ClaudeCLIAdapter] = None,
        gemini_adapter: Optional[GeminiCLIAdapter] = None,
    ):
        self._fallback = fallback
        self._claude = claude_adapter or ClaudeCLIAdapter()
        self._gemini = gemini_adapter or GeminiCLIAdapter()

    def _pick(self, config: PIAgentConfig) -> PIRuntimeAdapter:
        agent_def = _agent_definition_path(config.profile_id)
        fm = _read_frontmatter(agent_def) if agent_def else {}
        raw = fm.get("models") or fm.get("model") or ""
        specs = raw.split(",") if isinstance(raw, str) else (raw or [])
        first = str(specs[0]).strip() if specs else ""
        if first.startswith("claude-cli/"):
            return self._claude
        if first.startswith("gemini-cli/"):
            return self._gemini
        return self._fallback

    def spawn_agent(self, config: PIAgentConfig) -> str:
        return self._pick(config).spawn_agent(config)

    def get_run_status(self, run_id: str) -> dict:
        # Try each adapter — run IDs are globally unique UUIDs
        for adapter in (self._claude, self._gemini, self._fallback):
            try:
                return adapter.get_run_status(run_id)
            except KeyError:
                continue
        raise KeyError(f"Unknown run_id: {run_id!r}")

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        for adapter in (self._claude, self._gemini, self._fallback):
            try:
                adapter.get_run_status(run_id)   # raises KeyError if unknown
                return adapter.wait_for_run(run_id, timeout)
            except KeyError:
                continue
        raise KeyError(f"Unknown run_id: {run_id!r}")

    def list_profiles(self) -> list[dict]:
        seen: set[str] = set()
        result: list[dict] = []
        for adapter in (self._claude, self._gemini, self._fallback):
            for p in adapter.list_profiles():
                if p["profile_id"] not in seen:
                    seen.add(p["profile_id"])
                    result.append(p)
        return result

    def get_profile(self, profile_id: str) -> Optional[dict]:
        for adapter in (self._claude, self._gemini, self._fallback):
            p = adapter.get_profile(profile_id)
            if p is not None:
                return p
        return None

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        return self._fallback.invoke_team(template_id, task_packet)
