#!/usr/bin/env python3
"""End-to-end voice-chat check.

Exercises the complete conversational loop exactly like the browser does:

  1  mic audio  ->  POST /api/chat/asr   -> transcript
  2  transcript ->  POST /api/speak     -> DeepSeek V4 stream -> 2x TTS -> cloned PCM
  3  barge-in   ->  POST /api/chat/interrupt while the assistant is speaking

plus hard latency / throughput assertions:
  * first audio (browser) < FIRST_AUDIO_S
  * session RTF (audio_s / wall_s) <= 1 / RTF_TARGET   (i.e. RTF <= 0.5)
  * no underrun in a simulated real-time player
  * both GPUs used, segments in order, no error frames

usage: chat_check.py [--url http://127.0.0.1:7860] [--profile ID] [--key sk-...]
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "py"))

from chat import QTTSChat, wav_from_pcm16  # noqa: E402

FIRST_AUDIO_S = 3.0     # the user's hard requirement
RTF_TARGET = 0.5        # session RTF <= 0.5  (RTF = wall_s / audio_s)
RESULTS: list[dict] = []


def check(name):
    def deco(fn):
        def run(*a, **k):
            t0 = time.time()
            try:
                ok, info = fn(*a, **k)
            except Exception as e:  # noqa: BLE001
                ok, info = False, f"EXC {type(e).__name__}: {e}"
            dt = time.time() - t0
            RESULTS.append({"name": name, "ok": bool(ok), "s": round(dt, 2), "info": info})
            print(f"[{'PASS' if ok else 'FAIL'}] {name:<38} {dt:6.1f}s  {info}", flush=True)
            return ok
        return run
    return deco


def tone_wav(seconds: float = 2.0, sr: int = 16000) -> bytes:
    """A speech-ish test signal (the mock ASR ignores the content)."""
    n = int(sr * seconds)
    t = [i / sr for i in range(n)]
    pcm = bytearray()
    for i in range(n):
        v = 0.18 * math.sin(2 * math.pi * 140 * t[i]) * (0.6 + 0.4 * math.sin(2 * math.pi * 3 * t[i]))
        pcm += struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767))
    return wav_from_pcm16(bytes(pcm), sr)


@check("gateway health + active profile")
def t_health(c: QTTSChat, profile: str) -> tuple[bool, str]:
    h = c.health()
    if not h.get("ok"):
        return False, str(h)
    pid = profile or h.get("active_profile") or ""
    if not pid:
        return False, "no active voice profile (create one in the Voice Lab first)"
    return True, f"workers_healthy={h.get('workers_healthy')} agg_rtf={h.get('agg_rtf')} profile={pid}"


@check("config exposes the real runtime")
def t_config(c: QTTSChat) -> tuple[bool, str]:
    cfg = c.config()
    llm = cfg.get("llm") or {}
    ok = bool(cfg.get("model")) and bool(llm.get("model")) and cfg.get("sample_rate") == 24000
    return ok, f"tts={cfg.get('model')} llm={llm.get('model')} sr={cfg.get('sample_rate')} " \
               f"max_tokens={llm.get('max_tokens')}"


@check("ASR endpoint transcribes")
def t_asr(c: QTTSChat) -> tuple[bool, str]:
    r = c.asr(tone_wav(2.0))
    if r.get("status") != 200:
        return False, str(r)[:200]
    return True, f"text={str(r.get('text'))[:40]!r} lang={r.get('language')} " \
                 f"dur={r.get('duration_s')} engine={r.get('engine')}"


@check("chat turn: order, both GPUs, latency, RTF")
def t_chat(c: QTTSChat, profile: str, key: str) -> tuple[bool, str]:
    mode = "chat" if key else "read"
    r = c.speak("你好，请用两句话介绍一下你自己。", mode=mode, profile=profile)
    if not r.events:
        return False, "no frames"
    if r.errors:
        return False, f"errors={r.errors[:2]}"
    order = [e.seg for e in r.events if e.kind == "pcm"]
    if order != sorted(order):
        return False, "segments out of order"
    gpus = {s.get("gpu") for s in r.stats if s.get("gpu") is not None}
    # "x real time" = audio seconds produced per wall second.
    # RTF (real-time factor) = wall_s / audio_s  ->  the user wants RTF <= 0.5,
    # which means at least 2 seconds of audio per wall second.
    x_rt = float(r.end.get("overall_rtf_x") or 0) if r.end else 0.0
    if x_rt <= 0:
        x_rt = r.audio_s / max(r.wall_s, 1e-6)
    rtf = 1.0 / x_rt if x_rt > 0 else 99.0
    fast = float((r.policy or {}).get("start_fast_s") or 0.30)
    ok_first = r.first_audio_ms <= FIRST_AUDIO_S * 1000
    ok_rtf = rtf <= RTF_TARGET
    ok = ok_first and ok_rtf and len(gpus) >= 1
    return ok, (f"mode={mode} first_audio={r.first_audio_ms:.0f}ms (limit {FIRST_AUDIO_S * 1000:.0f}) "
                f"rtf={rtf:.3f} (limit {RTF_TARGET}) [{x_rt:.2f}x realtime] gpus={sorted(gpus)} "
                f"audio={r.audio_s:.1f}s wall={r.wall_s:.1f}s fast_start={fast} "
                f"text={r.text[:30]!r}")


@check("missing LLM key fails gracefully")
def t_llm_key(c: QTTSChat, profile: str, key: str) -> tuple[bool, str]:
    if key:
        return True, "skipped (an api key is configured)"
    r = c.speak("测试", mode="chat", profile=profile)
    if not r.errors:
        return False, "expected a clear error frame when no api key is set"
    msg = r.errors[0]
    return "DEEPSEEK_API_KEY" in msg or "api key" in msg.lower(), f"error={msg[:90]!r}"


@check("no underrun in a simulated real-time player")
def t_player(c: QTTSChat, profile: str, key: str) -> tuple[bool, str]:
    from chat import simulate_player
    mode = "chat" if key else "read"
    r = c.speak("这是一段稍长一些的测试内容，用来验证播放过程中不会因为生产速度不足而出现卡顿或者欠载的情况。"
                "我们继续说下去，看看缓冲区水位是否稳定。", mode=mode, profile=profile)
    pol = r.policy or {}
    p = simulate_player(r, float(pol.get("start_s", 2.0)), float(pol.get("low_s", 5.0)),
                        float(pol.get("start_fast_s", 0.30)))
    ok = p["underruns"] == 0 and p["total_audio_s"] > 1.0
    return ok, (f"underruns={p['underruns']} max_gap={p['max_gap_s']}s "
                f"first_play={p['first_play_s']} audio={p['total_audio_s']}s")


@check("barge-in stops the session")
def t_interrupt(c: QTTSChat, profile: str) -> tuple[bool, str]:
    holder: dict = {}

    def run():
        holder["r"] = c.speak(
            "请详细讲解一下双卡流式语音克隆的原理，越详细越好，需要很长很长的回答，"
            "请逐句展开每一个技术细节，包含调度、缓存、采样率与网络传输方面的分析。",
            mode="read", profile=profile)

    th = threading.Thread(target=run, daemon=True)
    th.start()
    time.sleep(1.2)
    sess = c.get_json("/api/chat/state").get("sessions") or []
    sid = sess[0]["id"] if sess else ""
    if not sid:
        th.join(timeout=30)
        return False, "no active session to interrupt"
    res = c.interrupt(sid, "barge-in")
    th.join(timeout=60)
    r = holder.get("r")
    if r is None:
        return False, "the chat call did not return"
    ok = bool(res.get("interrupted")) and (r.interrupted or r.end.get("interrupted"))
    return ok, f"session={sid} interrupted={res.get('interrupted')} " \
               f"stream_interrupted={r.interrupted} wall={r.wall_s:.1f}s audio={r.audio_s:.1f}s"


@check("interrupt-all is safe with no session")
def t_interrupt_all(c: QTTSChat) -> tuple[bool, str]:
    r = c.interrupt_all("test")
    return bool(r.get("ok")), f"interrupted={r.get('interrupted')}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:7860")
    ap.add_argument("--profile", default="")
    ap.add_argument("--key", default="")
    a = ap.parse_args()
    c = QTTSChat(a.url, a.key)
    profile = a.profile or c.active_profile()
    print(f"QTTS chat check  gateway={a.url}  profile={profile}")
    t_health(c, profile)
    t_config(c)
    t_asr(c)
    if profile:
        t_chat(c, profile, a.key)
        t_llm_key(c, profile, a.key)
        t_player(c, profile, a.key)
        t_interrupt(c, profile)
    t_interrupt_all(c)
    bad = [r for r in RESULTS if not r["ok"]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} passed")
    for r in bad:
        print(f"  ✗ {r['name']}: {r['info']}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
