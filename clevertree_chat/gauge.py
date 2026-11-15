"""Phase-2 hardware shape, measured without booting it by default.

The always-on path is the debate API. The batch path writes job.json and then
these scripts echo (or, when CLEVERTREE_SPOT_WAKE=1, request) Spot calls.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WAKE = ROOT / "infra" / "spot-wake-comments.sh"
STOP = ROOT / "infra" / "spot-decommission-comments.sh"
LATENCY = "gauge/live-key-latency.json"
ECHO = "gauge/batch-echo.json"


def spot_wake_enabled() -> bool:
    return os.environ.get("CLEVERTREE_SPOT_WAKE", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def record_submit(debate, slot: str, latency_ms: float) -> None:
    """Append the live submit latency for the starting slot. Local record only."""
    payload = debate._read_json(LATENCY, {"samples": []})
    samples = list(payload.get("samples") or [])
    samples.append(
        {
            "slot": slot,
            "latency_ms": round(float(latency_ms), 3),
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    )
    payload["samples"] = samples[-40:]
    debate.repo.commit_changes(
        {LATENCY: json.dumps(payload, indent=2, sort_keys=True) + "\n"},
        [],
        "record live key latency",
        "clevertree-chat-ai",
    )


def measure_batch(debate) -> dict:
    """Run wake/decommission scripts. Boots hardware only when wake env + token set."""
    wake_on = spot_wake_enabled()
    env = os.environ.copy()
    if wake_on:
        env["CLEVERTREE_SPOT_WAKE"] = "1"
    wake = _echo(WAKE, env=env)
    stop = _echo(STOP, env=env)
    # Real API call only when wake is on and the script reports API_CALLED=1.
    api_called = wake_on and "API_CALLED=1" in wake
    note = {
        "booted": api_called,
        "cloud_api_called": api_called,
        "wake_requested": wake_on,
        "class": "gpu.vs2.xlargeplusplus-sjc",
        "wake": wake,
        "decommission": stop,
    }
    debate.repo.commit_changes(
        {ECHO: json.dumps(note, indent=2, sort_keys=True) + "\n"},
        [],
        "record batch hardware echo",
        "clevertree-chat-ai",
    )
    return note


def _echo(path: Path, *, env: dict | None = None) -> str:
    if not path.is_file():
        return f"# missing {path.name} (echo skipped)\n"
    completed = subprocess.run(
        ["sh", str(path)],
        check=False,
        capture_output=True,
        text=True,
        env=env or os.environ.copy(),
    )
    if completed.returncode != 0:
        err = (completed.stderr or completed.stdout or "").strip()
        return f"# {path.name} exit {completed.returncode}: {err}\n"
    return completed.stdout
