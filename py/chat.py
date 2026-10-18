#!/usr/bin/env python3
"""Voice-chat client library for QTTS.

The browser drives the same protocol, this module makes it scriptable so the
whole chat loop (ASR -> DeepSeek -> prosody segmenter -> 2x TTS -> cloned voice)
can be tested end to end without a browser.

Wire protocol (gateway -> client), repeated frames:
    [type u8][seg u32 LE][len u32 LE][payload]
    1 = PCM int16 mono @ 24 kHz   2 = segment meta   3 = LLM text
    4 = segment stats             5 = end summary    6 = error
    7 = watermark policy          8 = event (phase changes)
"""
from __future__ import annotations

import io
import json
import struct
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

SR = 24000

F_PCM, F_SEG, F_TEXT, F_STATS, F_END, F_ERROR, F_POLICY, F_EVENT = 1, 2, 3, 4, 5, 6, 7, 8


def wav_from_pcm16(pcm: bytes, sr: int = SR) -> bytes:
    """Wrap raw little-endian int16 mono PCM in a RIFF/WAVE container."""
    n = len(pcm)
    hdr = b"RIFF" + struct.pack("<I", 36 + n) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16) + b"data" + struct.pack("<I", n)
    return hdr + pcm


@dataclass
class ChatEvent:
    kind: str                 # pcm | seg | text | stats | end | error | policy | event
    payload: object = None
    seg: int = 0
    at: float = 0.0
    samples: int = 0


@dataclass
class ChatResult:
    session: str = ""
    text: str = ""
    audio_s: float = 0.0
    first_audio_ms: float = 0.0
    first_text_ms: float = 0.0
    wall_s: float = 0.0
    events: list[ChatEvent] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    segments: list[dict] = field(default_factory=list)
    stats: list[dict] = field(default_factory=list)
    policy: dict = field(default_factory=dict)
    end: dict = field(default_factory=dict)
    phases: list[str] = field(default_factory=list)
    interrupted: bool = False


class QTTSChat:
    """Minimal client for the QTTS gateway."""

    def __init__(self, base: str = "http://127.0.0.1:7860", key: str = "", timeout: float = 300.0):
        self.base = base.rstrip("/")
        self.key = key
        self.timeout = timeout

    # ---------------------------------------------------------------- http helpers
    def _req(self, path: str, data: bytes | None = None, headers: dict | None = None,
             method: str = "GET") -> tuple[int, bytes, dict]:
        req = urllib.request.Request(self.base + path, data=data, method=method)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return r.status, r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)

    def get_json(self, path: str) -> dict:
        _, body, _ = self._req(path)
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:  # noqa: BLE001
            return {"error": body[:200].decode("utf-8", "ignore")}

    def post_json(self, path: str, obj: dict) -> dict:
        _, body, _ = self._req(path, json.dumps(obj).encode(),
                               {"Content-Type": "application/json"}, "POST")
        try:
            return json.loads(body.decode("utf-8"))
        except Exception:  # noqa: BLE001
            return {"error": body[:200].decode("utf-8", "ignore")}

    def health(self) -> dict:
        return self.get_json("/api/health")

    def config(self) -> dict:
        return self.get_json("/api/config")

    def profiles(self) -> dict:
        return self.get_json("/api/profiles")

    def active_profile(self) -> str:
        p = self.profiles()
        return (p or {}).get("active") or ""

    # ---------------------------------------------------------------- chat
    def asr(self, wav: bytes, filename: str = "mic.wav") -> dict:
        """Send a recording to the analyst's ASR endpoint (multipart)."""
        boundary = "----qtts" + str(int(time.time() * 1000))
        body = b""
        body += f"--{boundary}\r\n".encode()
        body += (f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                 "Content-Type: audio/wav\r\n\r\n").encode()
        body += wav + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        st, raw, _ = self._req("/api/chat/asr", body,
                                {"Content-Type": f"multipart/form-data; boundary={boundary}"}, "POST")
        try:
            out = json.loads(raw.decode("utf-8"))
        except Exception:  # noqa: BLE001
            out = {"error": raw[:200].decode("utf-8", "ignore")}
        out["status"] = st
        return out

    def interrupt(self, session: str, reason: str = "user") -> dict:
        return self.post_json("/api/chat/interrupt", {"session": session, "reason": reason})

    def interrupt_all(self, reason: str = "user") -> dict:
        return self.post_json("/api/chat/interrupt", {"all": True, "reason": reason})

    def speak(self, text: str, mode: str = "chat", profile: str = "", language: str = "auto",
              history: list | None = None, tone: str = "concise",
              on_event=None) -> ChatResult:
        """Run one /api/speak request and decode every frame."""
        payload = {"text": text, "mode": mode, "language": language, "tone": tone}
        if profile:
            payload["profile"] = profile
        if history:
            payload["history"] = history
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["X-DeepSeek-Key"] = self.key
        req = urllib.request.Request(self.base + "/api/speak", data=json.dumps(payload).encode(),
                                     headers=headers, method="POST")
        t0 = time.time()
        res = ChatResult()
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            res.session = r.headers.get("X-Session-Id", "")
            buf = bytearray()
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                buf += chunk
                while len(buf) >= 9:
                    typ, seg, ln = struct.unpack("<BII", bytes(buf[:9]))
                    if len(buf) < 9 + ln:
                        break
                    body = bytes(buf[9:9 + ln])
                    del buf[:9 + ln]
                    at = time.time() - t0
                    if typ == F_PCM:
                        n = ln // 2
                        res.audio_s += n / SR
                        if res.first_audio_ms == 0:
                            res.first_audio_ms = at * 1000
                        res.events.append(ChatEvent("pcm", seg=seg, at=at, samples=n))
                    elif typ == F_SEG:
                        res.segments.append(json.loads(body.decode("utf-8")))
                        res.events.append(ChatEvent("seg", seg=seg, at=at))
                    elif typ == F_TEXT:
                        res.text += json.loads(body.decode("utf-8"))["t"]
                        if res.first_text_ms == 0:
                            res.first_text_ms = at * 1000
                        res.events.append(ChatEvent("text", seg=seg, at=at))
                    elif typ == F_STATS:
                        res.stats.append(json.loads(body.decode("utf-8")))
                        res.events.append(ChatEvent("stats", seg=seg, at=at))
                    elif typ == F_END:
                        res.end = json.loads(body.decode("utf-8"))
                        res.events.append(ChatEvent("end", seg=seg, at=at))
                    elif typ == F_ERROR:
                        res.errors.append(json.loads(body.decode("utf-8")).get("error", "?"))
                        res.events.append(ChatEvent("error", seg=seg, at=at))
                    elif typ == F_POLICY:
                        res.policy = json.loads(body.decode("utf-8"))
                        res.events.append(ChatEvent("policy", seg=seg, at=at))
                    elif typ == F_EVENT:
                        ev = json.loads(body.decode("utf-8"))
                        res.phases.append(ev.get("phase", "?"))
                        if ev.get("phase") == "interrupted":
                            res.interrupted = True
                        res.events.append(ChatEvent("event", ev, seg=seg, at=at))
                    if on_event:
                        on_event(ChatEvent({F_PCM: "pcm", F_SEG: "seg", F_TEXT: "text",
                                            F_STATS: "stats", F_END: "end", F_ERROR: "error",
                                            F_POLICY: "policy", F_EVENT: "event"}.get(typ, "?"),
                                            body, seg, at))
        res.wall_s = time.time() - t0
        return res


def simulate_player(result: ChatResult, start_s: float, resume_s: float,
                    fast_start_s: float = 0.30) -> dict:
    """Replay the produced audio against a real-time player and count underruns."""
    arrivals = [(e.at, e.samples / SR) for e in result.events if e.kind == "pcm"]
    if not arrivals:
        return {"underruns": 0, "max_gap_s": 0.0, "first_play_s": None, "total_audio_s": 0.0}
    queue = 0.0
    playing = False
    under = 0
    gap = 0.0
    cur_gap = 0.0
    maxgap = 0.0
    first = None
    consumed = 0.0
    total = sum(a for _, a in arrivals)
    dt = 0.005
    t = arrivals[0][0]
    ai = 0
    end_t = arrivals[-1][0] + total + 30
    while t < end_t and consumed < total - 1e-6:
        while ai < len(arrivals) and arrivals[ai][0] <= t:
            queue += arrivals[ai][1]
            ai += 1
        all_arrived = ai >= len(arrivals)
        if not playing:
            thr = fast_start_s if first is None else resume_s
            if queue >= thr or (all_arrived and queue > 0):
                playing = True
                if first is None:
                    first = t
                if cur_gap > 0:
                    maxgap = max(maxgap, cur_gap)
                    cur_gap = 0.0
            elif first is not None:
                gap += dt
                cur_gap += dt
        if playing:
            use = min(dt, queue)
            queue -= use
            consumed += use
            if queue <= 1e-9 and not all_arrived:
                playing = False
                under += 1
        t += dt
    return {"underruns": under, "max_gap_s": round(max(maxgap, cur_gap), 3), "first_play_s": first,
            "total_audio_s": round(total, 2), "start_s": start_s}
