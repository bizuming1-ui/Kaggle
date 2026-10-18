#!/usr/bin/env python3
"""Failure-injection experiment: the pipeline must survive a GPU worker dying.

Scenarios (all against the live mock stack):
  1. kill worker0 mid-session      -> the other GPU must finish the segments
  2. restart check                 -> the supervisor must bring worker0 back
  3. interrupt during generation   -> the stream must end cleanly, no hang
  4. no-profile request            -> a clear 400, not a 500
  5. empty text                    -> a clear 400
usage: failinject.py [--url http://127.0.0.1:7860] [--profile ID]
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "py"))
from chat import QTTSChat  # noqa: E402

RESULTS: list[dict] = []
LONG = ("请详细讲解一下双卡流式语音克隆的原理。" * 12)


def check(name):
    def deco(fn):
        def run(*a, **k):
            t0 = time.time()
            try:
                ok, info = fn(*a, **k)
            except Exception as e:  # noqa: BLE001
                ok, info = False, f"EXC {type(e).__name__}: {e}"
            RESULTS.append({"name": name, "ok": bool(ok), "info": info})
            print(f"[{'PASS' if ok else 'FAIL'}] {name:<40} {time.time() - t0:5.1f}s  {info}",
                  flush=True)
            return ok
        return run
    return deco


def worker_pids() -> dict[int, int]:
    """Map GPU index -> pid of py/worker.py --gpu N."""
    out = {}
    try:
        r = subprocess.run(["pgrep", "-af", "worker.py"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            if "worker.py" not in line or "--gpu" not in line:
                continue
            parts = line.split()
            try:
                pid = int(parts[0])
                idx = int(parts[parts.index("--gpu") + 1])
                out[idx] = pid
            except (ValueError, IndexError):
                continue
    except Exception:  # noqa: BLE001
        pass
    return out


@check("kill worker0 mid-session -> stream still completes")
def t_kill_mid_stream(c: QTTSChat, profile: str) -> tuple[bool, str]:
    pids = worker_pids()
    if 0 not in pids:
        return False, f"cannot find worker0 pid (pgrep saw {pids})"
    holder: dict = {}

    def run():
        holder["r"] = c.speak(LONG, mode="read", profile=profile)

    th = threading.Thread(target=run, daemon=True)
    th.start()
    time.sleep(0.6)
    os.kill(pids[0], signal.SIGKILL)
    t_kill = time.time()
    th.join(timeout=120)
    r = holder.get("r")
    if r is None:
        return False, "the stream never returned"
    elapsed = time.time() - t_kill
    ok = r.end is not None and r.audio_s > 1.0
    gpus = {s.get("gpu") for s in r.stats}
    return ok, (f"audio={r.audio_s:.1f}s wall={r.wall_s:.1f}s gpus={sorted(g for g in gpus if g is not None)} "
                f"errors={len(r.errors)} recovered_in={elapsed:.1f}s")


@check("supervisor restarts the killed worker")
def t_restarted(c: QTTSChat) -> tuple[bool, str]:
    t0 = time.time()
    while time.time() - t0 < 120:
        pids = worker_pids()
        if 0 in pids:
            try:
                h = requests.get("http://127.0.0.1:7001/health", timeout=3).json()
                if h.get("ready"):
                    return True, f"worker0 ready again in {time.time() - t0:.1f}s (pid {pids[0]})"
            except Exception:  # noqa: BLE001
                pass
        time.sleep(2)
    return False, "worker0 did not come back within 120 s"


@check("interrupt during generation ends the stream cleanly")
def t_interrupt_mid_stream(c: QTTSChat, profile: str) -> tuple[bool, str]:
    holder: dict = {}

    def run():
        holder["r"] = c.speak(LONG, mode="read", profile=profile)

    th = threading.Thread(target=run, daemon=True)
    th.start()
    time.sleep(1.0)
    res = c.interrupt_all("failinject")
    th.join(timeout=60)
    r = holder.get("r")
    if r is None:
        return False, "the stream hung after interrupt"
    ok = (r.end is not None) and th.is_alive() is False
    return ok, (f"interrupted={r.interrupted} end_frame={r.end is not None} "
                f"wall={r.wall_s:.1f}s audio={r.audio_s:.1f}s server={res}")


@check("request without a profile returns a clear 400")
def t_no_profile(c: QTTSChat) -> tuple[bool, str]:
    r = requests.post(c.base + "/api/speak", json={"text": "你好", "mode": "read", "profile": "no-such-voice"},
                      timeout=10)
    ok = r.status_code == 400
    return ok, f"status={r.status_code} body={r.text[:120]!r}"


@check("empty text returns a clear 400")
def t_empty_text(c: QTTSChat) -> tuple[bool, str]:
    r = requests.post(c.base + "/api/speak", json={"text": "   ", "mode": "read"}, timeout=10)
    ok = r.status_code == 400
    return ok, f"status={r.status_code} body={r.text[:120]!r}"


@check("gateway survives everything (health still ok)")
def t_still_alive(c: QTTSChat) -> tuple[bool, str]:
    h = c.health()
    return bool(h.get("ok") and h.get("workers_healthy")), f"workers_healthy={h.get('workers_healthy')}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:7860")
    ap.add_argument("--profile", default="")
    a = ap.parse_args()
    c = QTTSChat(a.url)
    profile = a.profile or c.active_profile()
    print(f"QTTS failure injection  gateway={a.url}  profile={profile}")
    t_kill_mid_stream(c, profile)
    t_restarted(c)
    t_interrupt_mid_stream(c, profile)
    t_no_profile(c)
    t_empty_text(c)
    t_still_alive(c)
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed")
    for r in bad:
        print(f"  ✗ {r['name']}: {r['info']}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
