#!/usr/bin/env python3
"""QTTS self-test / monitor suite. One check per feature, each timed. Run after the system is up:

    python /kaggle/working/qtts/tools/selftest.py [--quality] [--profile ID]

Checks: Rust runtime · Go unit tests · workers (dtype, readiness) · per-GPU true streaming and RTF
        · gateway end-to-end (order, both GPUs, simulated player underruns) · optional quality/consistency.
"""
import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "py"))
STATE = Path(os.environ.get("QTTS_STATE", ROOT / "state"))
PORTS = [int(p) for p in os.environ.get("QTTS_WORKER_PORTS", "7001,7002").split(",")]
GW = f"http://127.0.0.1:{os.environ.get('QTTS_GATEWAY_PORT', '7860')}"
AN = f"http://127.0.0.1:{os.environ.get('QTTS_ANALYST_PORT', '7010')}"
RESULTS = []


def check(name):
    def deco(fn):
        def run(*a, **k):
            t = time.time()
            try:
                ok, info = fn(*a, **k)
            except Exception as e:  # noqa: BLE001
                ok, info = False, f"EXC {type(e).__name__}: {e}"
            dt = time.time() - t
            RESULTS.append({"name": name, "ok": bool(ok), "s": round(dt, 2), "info": info})
            print(f"[{'PASS' if ok else 'FAIL'}] {name:<34} {dt:6.1f}s  {info}", flush=True)
            return ok
        return run
    return deco


@check("rust runtime (leveler/breath)")
def t_rust():
    import numpy as np
    import audio_rt
    lv = audio_rt.Leveler(24000, -21.0)
    x = (0.04 * np.sin(2 * np.pi * 170 * np.arange(24000 * 6) / 24000)).astype(np.float32)
    lv.start_segment()
    out = lv.process(x)
    tail = out[-24000:].astype(np.float32) / 32768
    db = 20 * np.log10(np.sqrt(np.mean(tail ** 2)) + 1e-9)
    b = audio_rt.breath(8000, 24000, 3, -38.0)
    ok = abs(db + 21) < 2.5 and 0.001 < np.abs(b).max() < 0.5 and out.dtype == np.int16
    return ok, f"backend={audio_rt.BACKEND} converged_rms={db:.1f}dBFS (target -21) breath_peak={np.abs(b).max():.3f}"


@check("go unit tests (segmenter)")
def t_go():
    go = shutil.which("go") or str(ROOT / "tools_bin" / "go" / "bin" / "go")
    if not Path(go).exists() and not shutil.which("go"):
        return True, "skipped (go not installed)"
    env = {**os.environ, "GOCACHE": "/tmp/qtts-gocache", "GOPATH": "/tmp/qtts-gopath", "GOFLAGS": "-mod=mod"}
    r = subprocess.run([go, "test", "./..."], cwd=ROOT / "go" / "gateway", env=env, capture_output=True, text=True, timeout=300)
    return r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1][:120]


@check("workers ready")
def t_workers():
    infos = []
    ok = True
    for p in PORTS:
        h = requests.get(f"http://127.0.0.1:{p}/health", timeout=3).json()
        ok &= bool(h.get("ready"))
        infos.append(f"gpu{h.get('gpu')}:{h.get('engine')}/{h.get('dtype')}/rt={h.get('rt')}")
    return ok, " ".join(infos)


def stream_once(port, profile, text, chunk=8):
    t0 = time.time()
    r = requests.post(f"http://127.0.0.1:{port}/synth", json={"profile": profile, "text": text, "chunk_size": chunk,
                                                              "language": "Auto", "seed": 5}, stream=True, timeout=(5, 300))
    buf = bytearray()
    arr = []
    stats = {}
    for c in r.iter_content(None):
        buf += c
        while len(buf) >= 5:
            t, ln = struct.unpack("<BI", buf[:5])
            if len(buf) < 5 + ln:
                break
            p = bytes(buf[5:5 + ln])
            del buf[:5 + ln]
            if t == 1:
                arr.append((time.time() - t0, ln // 2))
            elif t == 2:
                stats = json.loads(p)
            elif t == 3:
                raise RuntimeError(p.decode())
    return arr, stats, time.time() - t0


def active_profile(arg):
    if arg:
        return arg
    try:
        return json.loads((STATE / "active.json").read_text()).get("id")
    except Exception:  # noqa: BLE001
        return None


@check("per-GPU streaming + RTF")
def t_stream(profile):
    if not profile:
        return True, "skipped (no active profile yet: create one in Voice Lab)"
    text = "今天天气真不错，我们一起去公园散步吧，路上还可以聊聊最近发生的有趣的事情。"
    rows = []
    ok = True
    for p in PORTS:
        arr, st, total = stream_once(p, profile, text)
        audio = sum(n for _, n in arr) / 24000
        first = arr[0][0] if arr else 9e9
        streaming = len(arr) >= 3 and first < 0.7 * total
        gaps = [b[0] - a[0] for a, b in zip(arr, arr[1:])]
        ok &= streaming and audio > 1.0 and not st.get("anomalies")
        rows.append(f"gpu{st.get('gpu')}: first_audio={first * 1000:.0f}ms rtf={st.get('rtf_x')}x chunks={len(arr)} "
                    f"max_chunk_gap={max(gaps) * 1000 if gaps else 0:.0f}ms audio={audio:.1f}s anomalies={st.get('anomalies')}")
    return ok, " | ".join(rows)


@check("gateway end-to-end (2 GPUs, order, no underrun)")
def t_e2e(profile):
    if not profile:
        return True, "skipped (no active profile)"
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "e2e_check.py"), "--url", GW, "--profile", profile,
                        "--min-gpus", str(min(2, len(PORTS)))], capture_output=True, text=True, timeout=600)
    print("\n".join("      " + l for l in r.stdout.splitlines()))
    return r.returncode == 0, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-120:]


# ------------------------------------------------------------------ latency budget
# The two hard numbers the project promises:
#   * first audible audio  < 3 s   (measured the way the browser sees it)
#   * aggregate RTF        < 0.5   (wall seconds / audio seconds)
# RTF < 0.5 means the stack must produce at least 2 s of audio per wall second.
LAT: dict = {}
LAT_TEXT = ("这是一段用于测量首包延迟与实时倍率的测试文本。"
            "我们希望系统在两秒之内就开始播放，并且整体速度要快于实时。"
            "接下来继续说一些内容，让整段音频足够长，避免统计误差。")


def _measure_latency(profile: str) -> dict:
    """One /api/speak call, measured exactly like the browser measures it."""
    if LAT:
        return LAT
    t0 = time.time()
    r = requests.post(GW + "/api/speak", json={"text": LAT_TEXT, "mode": "read", "profile": profile},
                      stream=True, timeout=(5, 600))
    first = None
    samples = 0
    wall = 0.0
    segs = 0
    gpus = set()
    buf = bytearray()
    for c in r.iter_content(None):
        buf += c
        while len(buf) >= 9:
            typ, seg, ln = struct.unpack("<BII", buf[:9])
            if len(buf) < 9 + ln:
                break
            p = bytes(buf[9:9 + ln])
            del buf[:9 + ln]
            if typ == 1:
                if first is None:
                    first = time.time() - t0
                samples += ln // 2
            elif typ == 2:
                segs += 1
            elif typ == 4:
                try:
                    gpus.add(json.loads(p.decode()).get("gpu"))
                except Exception:  # noqa: BLE001
                    pass
    wall = time.time() - t0
    LAT.update({
        "first_s": first, "audio_s": samples / 24000, "wall_s": wall, "segs": segs,
        "gpus": sorted(g for g in gpus if g is not None),
        "rtf": (wall / (samples / 24000)) if samples else 9.9,
    })
    return LAT


@check("first audio < 3 s (browser path)")
def t_first_audio(profile):
    if not profile:
        return True, "skipped (no active profile)"
    m = _measure_latency(profile)
    if m["first_s"] is None:
        return False, "no audio produced"
    return m["first_s"] < 3.0, (f"first_audio={m['first_s'] * 1000:.0f}ms  (limit 3000)  "
                                 f"segs={m['segs']}  gpus={m['gpus']}")


@check("aggregate RTF < 0.5 (wall / audio)")
def t_rtf(profile):
    if not profile:
        return True, "skipped (no active profile)"
    m = _measure_latency(profile)
    if not m["audio_s"]:
        return False, "no audio produced"
    return m["rtf"] < 0.5, (f"rtf={m['rtf']:.3f}  (limit 0.5)  audio={m['audio_s']:.1f}s  "
                           f"wall={m['wall_s']:.1f}s  -> {m['audio_s'] / max(m['wall_s'], 1e-6):.2f}x realtime")


@check("quality + dual-GPU consistency")
def t_quality(profile):
    if not profile:
        return True, "skipped (no active profile)"
    r = requests.post(AN + "/consistency", json={"profile": profile}, timeout=900).json()
    print(json.dumps(r.get("delta"), ensure_ascii=False), "cross_sim=", r.get("cross_gpu_speaker_sim"), "model=", r.get("speaker_model"))
    for g in r.get("gpus", []):
        print("      gpu", g["gpu"], json.dumps(g.get("mean"), ensure_ascii=False))
    return bool(r.get("consistent")), f"consistent={r.get('consistent')} delta={r.get('delta')}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="")
    ap.add_argument("--quality", action="store_true")
    a = ap.parse_args()
    pid = active_profile(a.profile)
    print(f"QTTS selftest  gateway={GW}  workers={PORTS}  profile={pid}")
    t_rust()
    t_go()
    t_workers()
    t_stream(pid)
    t_e2e(pid)
    t_first_audio(pid)
    t_rtf(pid)
    if a.quality:
        t_quality(pid)
    (STATE / "selftest.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1))
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed  → {STATE / 'selftest.json'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
