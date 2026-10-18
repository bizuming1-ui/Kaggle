"""Process supervisor + long-run watchdog.

Starts analyst, one worker per GPU and the Go gateway; restarts anything that dies
(exit code 75 = graceful self-restart requested by a worker), kills workers that stall
mid-segment, re-arms the active voice on restarted workers and periodically snapshots the
state to a Kaggle Dataset when credentials exist.
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qtts_common import ANALYST_PORT, GATEWAY_PORT, LOG_DIR, ROOT, STATE, WORKER_PORTS, get_logger, read_json  # noqa: E402

log = get_logger("supervisor")
PY = sys.executable
N_WORKERS = len(WORKER_PORTS)
STOP = threading.Event()


def http_json(url: str, timeout: float = 2.0, data: dict | None = None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


class Proc:
    def __init__(self, name: str, cmd: list[str], env: dict[str, str], health_url: str | None = None):
        self.name, self.cmd, self.env, self.health_url = name, cmd, env, health_url
        self.p: subprocess.Popen | None = None
        self.restarts: list[float] = []
        self.ready_seen = False
        self.fail_count = 0
        self.gave_up = False
        self.started_at = 0.0

    def start(self):
        logf = open(LOG_DIR / f"{self.name}.out", "ab", buffering=0)
        try:
            self.p = subprocess.Popen(self.cmd, env={**os.environ, **self.env}, stdout=logf, stderr=subprocess.STDOUT,
                                      start_new_session=True)
        except OSError as e:
            log.error("cannot start %s: %s", self.name, e)
            self.p, self.gave_up = None, True
            return
        self.started_at = time.time()
        self.ready_seen = False
        self.fail_count = 0
        log.info("started %s pid=%d", self.name, self.p.pid)

    def kill(self):
        if self.p and self.p.poll() is None:
            try:
                os.killpg(os.getpgid(self.p.pid), signal.SIGTERM)
                for _ in range(30):
                    if self.p.poll() is not None:
                        break
                    time.sleep(0.1)
                if self.p.poll() is None:
                    os.killpg(os.getpgid(self.p.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    def restart(self, reason: str):
        now = time.time()
        self.restarts = [t for t in self.restarts if now - t < 600] + [now]
        log.warning("restarting %s (%s) [%d in last 10 min]", self.name, reason, len(self.restarts))
        self.kill()
        if len(self.restarts) > 6:
            log.error("%s is crash-looping; giving up (see %s)", self.name, LOG_DIR / f"{self.name}.out")
            self.gave_up = True
            return
        time.sleep(min(2 ** (len(self.restarts) - 1), 20))
        self.start()


def build_procs() -> list[Proc]:
    procs: list[Proc] = []
    base_env = {"QTTS_ROOT": str(ROOT), "QTTS_STATE": str(STATE), "PYTHONUNBUFFERED": "1"}
    for i, port in enumerate(WORKER_PORTS):
        procs.append(Proc(f"worker{i}", [PY, str(ROOT / "py" / "worker.py"), "--gpu", str(i), "--port", str(port)],
                          {**base_env, "CUDA_VISIBLE_DEVICES": str(i)}, f"http://127.0.0.1:{port}/health"))
    last_gpu = str(max(N_WORKERS - 1, 0))
    procs.append(Proc("analyst", [PY, str(ROOT / "py" / "analyst.py")], {**base_env, "CUDA_VISIBLE_DEVICES": last_gpu},
                      f"http://127.0.0.1:{ANALYST_PORT}/health"))
    gw = ROOT / "go" / "gateway" / "gateway"
    # QTTS_BIND is configurable (e.g. 0.0.0.0 behind a preview proxy); the
    # default 127.0.0.1 is what Kaggle + cloudflared expect.
    bind = os.environ.get("QTTS_BIND", "127.0.0.1")
    procs.append(Proc("gateway", [str(gw)], {**base_env, "QTTS_WEB": str(ROOT / "web"), "QTTS_BIND": bind},
                      f"http://127.0.0.1:{GATEWAY_PORT}/api/health"))
    return procs


def arm_active_profile(port: int):
    """After a worker (re)start, rebuild the voice-clone prompt cache for the active profile."""
    act = read_json(STATE / "active.json", {}) or {}
    pid = act.get("id")
    if not pid:
        return
    try:
        r = http_json(f"http://127.0.0.1:{port}/profile/load", timeout=600, data={"profile": pid})
        log.info("re-armed profile %s on :%d -> %s", pid, port, r)
    except Exception as e:  # noqa: BLE001
        log.warning("could not re-arm profile on :%d: %s", port, e)


def watch(procs: list[Proc]):
    last_snapshot = time.time()
    last_state_sig = ""
    while not STOP.is_set():
        for pr in procs:
            if pr.gave_up or pr.p is None:
                continue
            code = pr.p.poll()
            if code is not None:
                pr.restart(f"exit code {code}")
                continue
            if not pr.health_url:
                continue
            try:
                h = http_json(pr.health_url, timeout=2.5)
                pr.fail_count = 0
                if pr.name.startswith("worker"):
                    ready = bool(h.get("ready"))
                    if ready and not pr.ready_seen:
                        pr.ready_seen = True
                        port = int(pr.health_url.split(":")[2].split("/")[0])
                        threading.Thread(target=arm_active_profile, args=(port,), daemon=True).start()
                    if h.get("busy") and float(h.get("stalled_s", 0)) > 90:
                        pr.restart("stalled mid-segment > 90 s")
                    if h.get("error") and not ready and time.time() - pr.started_at > 60:
                        pr.restart(f"engine error: {h.get('error')}")
            except Exception:  # noqa: BLE001
                pr.fail_count += 1
                grace = 1500 if pr.name.startswith("worker") else 60  # model load + graph capture takes a while
                if pr.fail_count >= 8 and time.time() - pr.started_at > grace:
                    pr.restart("health check failing")
        # periodic dataset snapshot (only when profiles changed)
        try:
            sig = json.dumps(sorted((str(p), p.stat().st_mtime) for p in (STATE / "profiles").rglob("profile.json")))
            if sig != last_state_sig and time.time() - last_snapshot > 600 and os.environ.get("KAGGLE_KEY"):
                last_state_sig, last_snapshot = sig, time.time()
                threading.Thread(target=lambda: __import__("persist").snapshot(), daemon=True).start()
        except Exception:  # noqa: BLE001
            pass
        STOP.wait(3.0)


def main():
    procs = build_procs()
    for pr in procs:
        pr.start()
        time.sleep(1.0 if pr.name.startswith("worker") else 0.2)

    def bye(*_):
        STOP.set()

    signal.signal(signal.SIGTERM, bye)
    signal.signal(signal.SIGINT, bye)
    try:
        watch(procs)
    finally:
        for pr in procs:
            pr.kill()
        log.info("supervisor stopped")


if __name__ == "__main__":
    (STATE / "supervisor.pid").write_text(str(os.getpid()))
    main()
