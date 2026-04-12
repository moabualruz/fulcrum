"""
Real PIRuntimeAdapter implementation via PI RPC subprocess bridge.

Spec §3.1: PI is the authoritative execution host.
B-001 unblock: spawn `pi --rpc`, send JSON-RPC over stdio.

Prerequisites:
    npm install -g @mariozechner/pi-coding-agent
    npm install -g @tintinweb/pi-subagents  # for subagent/team support

Usage:
    from pi_agent_os.worker.pi_rpc_bridge import PIRPCBridge
    from pi_agent_os.worker.pi_adapter import configure_pi_runtime
    configure_pi_runtime(PIRPCBridge())
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import threading
import time
import uuid
from queue import Empty, Queue
from typing import Any, Optional

from .pi_adapter import PIAgentConfig, PIRunResult, PIRuntimeAdapter

logger = logging.getLogger(__name__)


def check_pi_available() -> bool:
    """Return True if the `pi` CLI is available on PATH."""
    return shutil.which("pi") is not None


class PIRPCBridge(PIRuntimeAdapter):
    """
    Real PIRuntimeAdapter that bridges to the PI process via stdio JSON-RPC.

    Lazily spawns `pi --rpc` on first use. Communicates using JSON-RPC 2.0
    messages written to the process stdin and read from stdout.

    Thread-safe: a background reader thread dispatches responses to per-request
    queues stored in ``self._pending``.
    """

    def __init__(self, pi_command: str = "pi", timeout: float = 60.0) -> None:
        self._pi_command = pi_command
        self._timeout = timeout
        self._process: Optional[subprocess.Popen] = None
        self._pending: dict[str, Queue] = {}
        self._pending_lock = threading.Lock()
        self._reader: Optional[threading.Thread] = None
        self._start_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Process management
    # ------------------------------------------------------------------

    def _start_process(self) -> None:
        """Lazy-start: spawn `pi --rpc` if not already running."""
        with self._start_lock:
            if self._process is not None and self._process.poll() is None:
                return  # already running

            logger.debug("Spawning PI RPC process: %s --rpc", self._pi_command)
            self._process = subprocess.Popen(
                [self._pi_command, "--rpc"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # line-buffered
            )

            self._reader = threading.Thread(
                target=self._reader_thread,
                name="pi-rpc-reader",
                daemon=True,
            )
            self._reader.start()
            logger.debug("PI RPC process started (pid=%d)", self._process.pid)

    def _reader_thread(self) -> None:
        """Background thread: read stdout line by line and dispatch responses."""
        assert self._process is not None
        assert self._process.stdout is not None

        try:
            for line in self._process.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("PI RPC: could not parse line: %r", line)
                    continue

                req_id = msg.get("id")
                if req_id is None:
                    # Notification or malformed — log and skip
                    logger.debug("PI RPC notification: %s", msg)
                    continue

                with self._pending_lock:
                    queue = self._pending.get(str(req_id))

                if queue is not None:
                    queue.put(msg)
                else:
                    logger.warning("PI RPC: unexpected response id=%r", req_id)
        except Exception as exc:
            logger.error("PI RPC reader thread error: %s", exc)
        finally:
            # Wake up any waiting callers with an error
            with self._pending_lock:
                for queue in self._pending.values():
                    queue.put({"error": {"code": -32000, "message": "PI process exited"}})

    # ------------------------------------------------------------------
    # RPC call
    # ------------------------------------------------------------------

    def _send_rpc(self, method: str, params: dict) -> Any:
        """
        Send a JSON-RPC 2.0 request and wait for the response.

        Returns the ``result`` field of the response on success.
        Raises ``RuntimeError`` on timeout or if the response contains an error.
        """
        self._start_process()

        req_id = str(uuid.uuid4())
        queue: Queue = Queue()

        with self._pending_lock:
            self._pending[req_id] = queue

        request = json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params,
        })

        try:
            assert self._process is not None
            assert self._process.stdin is not None
            self._process.stdin.write(request + "\n")
            self._process.stdin.flush()
        except Exception as exc:
            with self._pending_lock:
                self._pending.pop(req_id, None)
            raise RuntimeError(f"Failed to write to PI process stdin: {exc}") from exc

        try:
            response = queue.get(timeout=self._timeout)
        except Empty:
            with self._pending_lock:
                self._pending.pop(req_id, None)
            raise RuntimeError(
                f"PI RPC timeout after {self._timeout}s waiting for method={method!r}"
            )
        finally:
            with self._pending_lock:
                self._pending.pop(req_id, None)

        if "error" in response:
            err = response["error"]
            raise RuntimeError(
                f"PI RPC error from method={method!r}: "
                f"[{err.get('code')}] {err.get('message')}"
            )

        return response.get("result")

    # ------------------------------------------------------------------
    # PIRuntimeAdapter implementation
    # ------------------------------------------------------------------

    def spawn_agent(self, config: PIAgentConfig) -> str:
        """Spawn a PI-native agent. Returns a run_id."""
        result = self._send_rpc("agent.spawn", {
            "profile_id": config.profile_id,
            "task": config.task_packet,
            "worktree": config.worktree_path,
            "timeout": config.timeout_seconds,
        })
        return result["run_id"]

    def get_run_status(self, run_id: str) -> dict:
        """Get live status of a PI agent run."""
        return self._send_rpc("agent.status", {"run_id": run_id})

    def wait_for_run(self, run_id: str, timeout: float | None = None) -> PIRunResult:
        """
        Poll ``get_run_status`` every 2 seconds until the run reaches a terminal
        state (completed, failed, blocked) or the timeout is exceeded.
        """
        terminal_states = {"completed", "failed", "blocked"}
        deadline = (time.monotonic() + timeout) if timeout is not None else None
        poll_interval = 2.0

        while True:
            status_dict = self.get_run_status(run_id)
            status = status_dict.get("status", "")

            if status in terminal_states:
                return PIRunResult(
                    run_id=run_id,
                    status=status,
                    output=status_dict.get("output", {}),
                    artifacts=status_dict.get("artifacts"),
                    error=status_dict.get("error"),
                )

            if deadline is not None and time.monotonic() >= deadline:
                raise RuntimeError(
                    f"wait_for_run timed out after {timeout}s for run_id={run_id!r}"
                )

            sleep_duration = poll_interval
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError(
                        f"wait_for_run timed out after {timeout}s for run_id={run_id!r}"
                    )
                sleep_duration = min(poll_interval, remaining)

            time.sleep(sleep_duration)

    def list_profiles(self) -> list[dict]:
        """List available PI-native profiles."""
        return self._send_rpc("profiles.list", {})

    def get_profile(self, profile_id: str) -> Optional[dict]:
        """Get a PI-native profile by ID."""
        return self._send_rpc("profiles.get", {"profile_id": profile_id})

    def invoke_team(self, template_id: str, task_packet: dict) -> str:
        """Invoke a PI-native team. Returns team instance ID."""
        result = self._send_rpc("team.invoke", {
            "template_id": template_id,
            "task": task_packet,
        })
        return result["instance_id"]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Terminate the PI subprocess and join the reader thread."""
        if self._process is not None:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process = None

        if self._reader is not None:
            self._reader.join(timeout=5)
            self._reader = None

    def __enter__(self) -> "PIRPCBridge":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()
