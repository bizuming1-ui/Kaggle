"""QTTS GPU worker: one process per T4.

Streams Qwen3-TTS-12Hz-1.7B-Base voice-clone audio (faster-qwen3-tts CUDA-graph backend),
post-processes every chunk through the Rust runtime and frames it for the Go gateway.

Wire format (worker -> gateway), repeated frames:  [type u8][len u32 LE][payload]
    1 = PCM int16 LE mono @ 24 kHz     2 = JSON stats (always the last frame)    3 = JSON error
"""
from __future__ import annotations

import argparse
import asyncio
import gc
import hashlib
import json
import math
import os
import queue
import random
import struct
import sys
import threading
import time
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--gpu", type=int, default=0)
ap.add_argument("--port", type=int, default=7001)
ap.add_argument("--host", default="127.0.0.1")
ARGS, _ = ap.parse_known_args()

# must be set before torch is imported anywhere
if os.environ.get("QTTS_MOCK", "0") != "1":
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", str(ARGS.gpu))
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio_rt  # noqa: E402
from qtts_common import (  # noqa: E402
    MOCK, MODEL_ID, SAMPLE_RATE, Ema, count_text_units, get_logger, load_profile, now_ms, profile_dir,
)

log = get_logger(f"worker{ARGS.gpu}")

F_PCM, F_STATS, F_ERR = 1, 2, 3
RESTART_EXIT_CODE = 75


def frame(t: int, payload: bytes) -> bytes:
    return struct.pack("<BI", t, len(payload)) + payload


def jframe(t: int, obj: dict) -> bytes:
    return frame(t, json.dumps(obj, ensure_ascii=False).encode("utf-8"))


# --------------------------------------------------------------------------------------
# Edge trimmer: drops model-generated leading silence, holds back trailing silence so it
# can be discarded at the end of a segment (explicit pauses are produced by the planner).
# --------------------------------------------------------------------------------------
class EdgeTrimmer:
    """Removes the model's own leading/trailing silence.

    The model always pads its output; the prosody planner owns the pauses, so
    the leading silence is dropped and the trailing silence is *held back* and
    discarded at the end of the segment (never emitted as audio).
    """

    BLOCK = 120  # 5 ms @ 24 kHz

    def __init__(self, sr=SAMPLE_RATE, thr_db=-46.0, keep_ms=35, max_lead_ms=900, max_held_ms=1800):
        self.sr = sr
        self.thr = 10 ** (thr_db / 20)
        self.keep = int(sr * keep_ms / 1000)
        self.max_lead = int(sr * max_lead_ms / 1000)
        self.max_held = int(sr * max_held_ms / 1000)
        self.started = False
        self.lead_dropped = 0
        self.held = np.zeros(0, dtype=np.float32)
        self.tail_dropped = 0

    def _voiced_mask(self, x: np.ndarray) -> np.ndarray:
        n = (len(x) // self.BLOCK) * self.BLOCK
        if n == 0:
            return np.zeros(0, dtype=bool)
        b = x[:n].reshape(-1, self.BLOCK)
        return np.sqrt(np.mean(b * b, axis=1)) > self.thr

    def push(self, x: np.ndarray) -> np.ndarray:
        if x.size == 0:
            return x
        if not self.started:
            m = self._voiced_mask(x)
            if m.any():
                idx = int(np.argmax(m)) * self.BLOCK
                x = x[max(0, idx - self.keep):]
                self.started = True
            else:
                self.lead_dropped += x.size
                if self.lead_dropped > self.max_lead:
                    self.started = True  # runaway silence: let it through, anomaly is flagged upstream
                else:
                    return np.zeros(0, dtype=np.float32)
        data = np.concatenate([self.held, x]) if self.held.size else x
        m = self._voiced_mask(data)
        if not m.any():
            # only silence so far: hold it, never emit it as speech
            if data.size > self.max_held:
                cut = data.size - self.max_held
                self.held = data[cut:]
                self.tail_dropped += cut
                return np.zeros(0, dtype=np.float32)
            self.held = data
            return np.zeros(0, dtype=np.float32)
        last = (len(m) - 1 - int(np.argmax(m[::-1]))) * self.BLOCK + self.BLOCK
        emit_to = min(data.size, last + self.keep)
        self.held = data[emit_to:]
        if self.held.size > self.max_held:
            emit_to = data.size - self.max_held
            self.held = data[emit_to:]
        return data[:emit_to]

    def flush(self) -> np.ndarray:
        """The held tail is the model's trailing silence -> drop it."""
        n = self.held.size
        self.tail_dropped += n
        self.held = np.zeros(0, dtype=np.float32)
        return np.zeros(0, dtype=np.float32)


# --------------------------------------------------------------------------------------
# Engines
# --------------------------------------------------------------------------------------
class MockEngine:
    """Deterministic fake TTS (voice-like harmonic signal) so the whole pipeline can be
    exercised on machines without a GPU. ~3x real time."""

    name = "mock"
    dtype_name = "mock"
    sample_rate = SAMPLE_RATE

    def __init__(self, gpu: int):
        self.gpu = gpu
        self.speed = float(os.environ.get("QTTS_MOCK_SPEED", "3.0"))

    def load(self):
        time.sleep(0.2)

    def load_profile(self, prof: dict) -> dict:
        return {"prompt_cache": "mock", "ms": 1.0}

    def stream(self, prof, text, language, chunk_size, max_new_tokens, seed, cancel):
        sr = self.sample_rate
        units = max(count_text_units(text), 1.0)
        dur = units / float(prof.get("units_per_sec", 4.5))
        total = int(dur * sr)
        step = int(sr * 0.08 * chunk_size)
        time.sleep(0.25 / self.speed)
        rng = np.random.default_rng(seed)
        f0 = 110 + 25 * rng.random()
        pos = 0
        phase = 0.0
        while pos < total and not cancel.is_set():
            n = min(step, total - pos)
            t = (np.arange(n) + pos) / sr
            f = f0 * (1 + 0.04 * np.sin(2 * np.pi * 5 * t))
            phase_arr = phase + np.cumsum(2 * np.pi * f / sr)
            phase = float(phase_arr[-1])
            sig = sum(np.sin(k * phase_arr) / k for k in range(1, 6))
            env = 0.5 + 0.5 * np.sin(2 * np.pi * 3.8 * t)
            lead = np.clip(t / 0.15, 0, 1)
            tail = np.clip((dur - t) / 0.15, 0, 1)
            y = (0.09 * sig * env * lead * tail).astype(np.float32)
            pos += n
            time.sleep((n / sr) / self.speed)
            yield y


class RealEngine:
    name = "faster-qwen3-tts"

    def __init__(self, gpu: int):
        self.gpu = gpu
        self.model = None
        self.sample_rate = SAMPLE_RATE
        self.dtype_name = os.environ.get("QTTS_DTYPE", "fp16")
        self.sane = False
        self._loaded_profiles: set[str] = set()
        # a 16 GB T4 must hold weights + static KV cache + the codec; 1024 is
        # enough for our segment sizes and saves ~1 GB compared to 2048.
        self.max_seq_len = int(os.environ.get("QTTS_MAX_SEQ_LEN", "1024"))

    @staticmethod
    def _torch_dtype(name: str):
        import torch
        return {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[name]

    def _dtype_chain(self) -> list[str]:
        """T4 (sm_75) has no native bf16 -> skip it, go fp16 -> fp32 directly."""
        import torch
        chain = ["fp16", "fp32"]
        try:
            major, minor = torch.cuda.get_device_capability()
            if major >= 8:  # Ampere+ has native bf16
                chain = ["fp16", "bf16", "fp32"]
        except Exception:  # noqa: BLE001
            pass
        if self.dtype_name in chain:
            chain = chain[chain.index(self.dtype_name):]
        return chain

    def load(self):
        import torch
        from faster_qwen3_tts import FasterQwen3TTS

        if not torch.cuda.is_available():
            raise RuntimeError("CUDA not available in worker (torch.cuda.is_available() is False)")
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.set_float32_matmul_precision("high")
        t0 = now_ms()
        log.info("loading %s dtype=%s max_seq_len=%d on cuda:0 (physical GPU %d)",
                 MODEL_ID, self.dtype_name, self.max_seq_len, ARGS.gpu)
        self.model = FasterQwen3TTS.from_pretrained(
            MODEL_ID, device="cuda", dtype=self._torch_dtype(self.dtype_name),
            attn_implementation="sdpa", max_seq_len=self.max_seq_len,
        )
        self.sample_rate = int(getattr(self.model, "sample_rate", SAMPLE_RATE) or SAMPLE_RATE)
        t1 = now_ms()
        self.model.warmup(prefill_len=100)
        log.info("model loaded in %.1fs, CUDA graphs captured in %.1fs",
                 (t1 - t0) / 1000, (now_ms() - t1) / 1000)

    def _unload(self):
        import torch
        self.model = None
        self._loaded_profiles.clear()
        gc.collect()
        torch.cuda.empty_cache()

    def _cache_has(self, anchor: str, ref_text: str) -> bool:
        cache = getattr(self.model, "_voice_prompt_cache", None)
        if not isinstance(cache, dict):
            return False
        for k in cache:
            try:
                if str(k[0]) == anchor and k[1] == ref_text:
                    return True
            except Exception:  # noqa: BLE001
                continue
        return False

    def load_profile(self, prof: dict) -> dict:
        """Pre-compute the voice-clone prompt so the first request is fast.

        The upstream cache key is (ref_audio path, ref_text, xvec_only,
        append_silence) - we must warm exactly that key.
        """
        t0 = now_ms()
        anchor = str(profile_dir(prof["id"]) / prof["anchor"])
        ref_text = prof["ref_text"]
        how = "cached"
        if not self._cache_has(anchor, ref_text):
            how = "direct"
            try:
                self.model._resolve_voice_clone_prompt_from_reference(
                    input_ids=[None], ref_audio=anchor, ref_text=ref_text,
                    xvec_only=False, append_silence=True)
            except Exception as e:  # private API may change: fall back to the public path
                how = f"warm-gen ({type(e).__name__})"
                cancel = threading.Event()
                for i, _ in enumerate(self.stream(prof, "你好。", "Chinese", 4, 40, 1, cancel)):
                    if i >= 1:
                        cancel.set()
        if not self._cache_has(anchor, ref_text):
            # the private API changed shape: warm the cache through the public
            # generation path (slower, but always correct).
            how = "warm-gen(public)"
            cancel = threading.Event()
            for i, _ in enumerate(self.stream(prof, "你好。", "Chinese", 4, 40, 1, cancel)):
                if i >= 1:
                    cancel.set()
            if not self._cache_has(anchor, ref_text):
                log.warning("prompt cache could not be confirmed for %s (it will be rebuilt per request)",
                            prof["id"])
        self._loaded_profiles.add(prof["id"])
        if not self.sane:
            self._sanity(prof)
        return {"prompt_cache": how, "ms": round(now_ms() - t0, 1), "dtype": self.dtype_name,
                "model": MODEL_ID, "max_seq_len": self.max_seq_len}

    def _sanity(self, prof: dict):
        """fp16 can overflow on some checkpoints: verify output, fall back if broken."""
        for dtype_name in self._dtype_chain():
            self.dtype_name = dtype_name
            cancel = threading.Event()
            chunks = []
            err = None
            try:
                for i, c in enumerate(self.stream(prof, "你好，很高兴见到你。", "Chinese", 8, 90, 7, cancel)):
                    chunks.append(np.asarray(c, dtype=np.float32))
                    if len(chunks) >= 2:
                        cancel.set()
                        break
            except Exception as e:  # noqa: BLE001
                err = e
            audio = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
            ok = (err is None and audio.size > 4000 and bool(np.isfinite(audio).all())
                  and audio_rt.rms_dbfs(audio) > -55)
            if ok:
                self.sane = True
                log.info("sanity ok (dtype=%s, %.2fs audio, rms %.1f dBFS)", self.dtype_name,
                         audio.size / self.sample_rate, audio_rt.rms_dbfs(audio))
                return
            log.error("sanity FAILED dtype=%s err=%r n=%d", self.dtype_name, err, audio.size)
            if dtype_name == self._dtype_chain()[-1]:
                break
            self._unload()
            self.load()
        raise RuntimeError("TTS sanity check failed for every dtype")

    def stream(self, prof, text, language, chunk_size, max_new_tokens, seed, cancel):
        import torch
        torch.manual_seed(int(seed) & 0x7FFFFFFF)
        g = prof.get("gen", {})
        anchor = str(profile_dir(prof["id"]) / prof["anchor"])
        it = self.model.generate_voice_clone_streaming(
            text=text, language=language, ref_audio=anchor, ref_text=prof["ref_text"],
            max_new_tokens=int(max_new_tokens), temperature=float(g.get("temperature", 0.8)),
            top_k=int(g.get("top_k", 50)), top_p=float(g.get("top_p", 1.0)),
            repetition_penalty=float(g.get("repetition_penalty", 1.05)),
            chunk_size=int(chunk_size), xvec_only=False, append_silence=True,
        )
        try:
            for audio, sr, _timing in it:
                if cancel.is_set():
                    break
                a = np.asarray(audio, dtype=np.float32).reshape(-1)
                self.sample_rate = int(sr)
                yield a
        finally:
            close = getattr(it, "close", None)
            if close:
                close()

    def vram(self):
        import torch
        free, total = torch.cuda.mem_get_info()
        return {"used_mb": round((total - free) / 2**20), "total_mb": round(total / 2**20),
                "alloc_mb": round(torch.cuda.memory_allocated() / 2**20)}


# --------------------------------------------------------------------------------------
# Worker core
# --------------------------------------------------------------------------------------
class Worker:
    def __init__(self):
        self.engine = MockEngine(ARGS.gpu) if MOCK else RealEngine(ARGS.gpu)
        self.ready = False
        self.error: str | None = None
        self.lock = threading.Lock()
        self.busy = False
        self.last_progress = time.time()
        self.served = 0
        self.failed = 0
        self.rtf = Ema(0.25)      # audio seconds / wall second
        self.ttfa = Ema(0.25)     # ms to first speech chunk of the engine
        self.profiles: dict[str, dict] = {}
        self.levelers: dict[str, audio_rt.Leveler] = {}
        self.breath_banks: dict[str, list[np.ndarray]] = {}
        self.restart_requested = False
        self.started = time.time()

    # -- loading ---------------------------------------------------------------------
    def boot(self):
        try:
            self.engine.load()
            self.ready = True
            log.info("worker ready (engine=%s rt=%s)", self.engine.name, audio_rt.BACKEND)
        except Exception as e:  # noqa: BLE001
            self.error = f"{type(e).__name__}: {e}"
            log.exception("engine load failed")

    def load_profile(self, pid: str) -> dict:
        prof = load_profile(pid)
        if not prof:
            raise FileNotFoundError(f"profile {pid} not found")
        if not self.ready:
            raise RuntimeError("engine not ready")
        with self.lock:  # never run while a synth is on the GPU
            info = self.engine.load_profile(prof)
            self.profiles[pid] = prof
            old = self.levelers.pop(pid, None)
            if old:
                old.close()
            self.levelers[pid] = audio_rt.Leveler(SAMPLE_RATE, float(prof.get("target_rms_dbfs", -21.0)))
            bank = []
            for fn in prof.get("breath_files", []):
                try:
                    import soundfile as sf
                    d, sr = sf.read(str(profile_dir(pid) / fn), dtype="float32")
                    if d.ndim > 1:
                        d = d.mean(axis=1)
                    if sr != SAMPLE_RATE:
                        n = int(len(d) * SAMPLE_RATE / sr)
                        d = np.interp(np.linspace(0, len(d) - 1, n), np.arange(len(d)), d).astype(np.float32)
                    bank.append(d)
                except Exception:  # noqa: BLE001
                    log.warning("could not read breath clip %s", fn)
            self.breath_banks[pid] = bank
        info["breath_clips"] = len(self.breath_banks.get(pid, []))
        return info

    # -- lead pause / breath ---------------------------------------------------------
    def lead_audio(self, prof: dict, pause_ms: int, want_breath: bool, seed: int) -> np.ndarray:
        sr = SAMPLE_RATE
        pause_ms = int(max(0, min(pause_ms, 1500)))
        if pause_ms <= 0:
            return np.zeros(0, np.float32)
        n = int(sr * pause_ms / 1000)
        out = np.zeros(n, np.float32)
        if want_breath and pause_ms >= 200:
            bank = self.breath_banks.get(prof["id"], [])
            rnd = random.Random(seed)
            if bank:
                b = bank[rnd.randrange(len(bank))].copy()
                b *= rnd.uniform(0.85, 1.1)
            else:
                blen = int(sr * rnd.uniform(0.26, 0.42))
                b = audio_rt.breath(blen, sr, seed, float(prof.get("breath_level_db", -37.0)))
            b = b[: max(0, n - int(sr * 0.04))]
            if b.size > 64:
                w = 96
                b[:w] *= np.linspace(0, 1, w, dtype=np.float32)
                b[-w:] *= np.linspace(1, 0, w, dtype=np.float32)
                start = n - b.size - int(sr * 0.05)  # breath sits just before the words
                start = max(0, start)
                out[start:start + b.size] += b[: n - start]
        return out

    # -- one job (runs in a dedicated thread) ----------------------------------------
    def run_job(self, body: dict, emit, cancel: threading.Event, t_req: float):
        stats: dict = {"gpu": ARGS.gpu, "engine": self.engine.name, "rt": audio_rt.BACKEND,
                       "dtype": self.engine.dtype_name, "anomalies": []}
        acquired = False
        try:
            if not self.ready:
                raise RuntimeError(self.error or "worker not ready")
            pid = body["profile"]
            if pid not in self.profiles:
                self.load_profile(pid)
            prof = self.profiles[pid]
            text = str(body["text"]).strip()
            if not text:
                raise ValueError("empty text")
            while not self.lock.acquire(timeout=0.1):
                if cancel.is_set():
                    return
            acquired = True
            self.busy = True
            self.last_progress = time.time()
            t_start = now_ms()
            stats["queue_ms"] = round(t_start - t_req, 1)
            seed = int(body.get("seed", random.randrange(1 << 30)))
            chunk_size = int(max(2, min(int(body.get("chunk_size", 8)), 16)))
            lang = body.get("language") or "Auto"
            ups = float(prof.get("units_per_sec", 4.5))
            units = max(count_text_units(text), 1.0)
            exp_s = units / ups
            max_new = int(max(40, min(1500, exp_s * 12.5 * 2.2 + 25)))
            leveler = self.levelers[pid]

            # lead pause + breath first: instantly available, keeps the client buffer fed
            lead = self.lead_audio(prof, int(body.get("lead_pause_ms", 0)), bool(body.get("breath", False)), seed)
            if lead.size:
                emit(frame(F_PCM, audio_rt.f32_to_i16(lead).tobytes()))
            stats["lead_ms"] = round(lead.size * 1000 / SAMPLE_RATE, 1)

            trimmer = EdgeTrimmer()
            leveler.start_segment()
            speech_samples = 0
            chunks = 0
            first_ms = None
            for a in self.engine.stream(prof, text, lang, chunk_size, max_new, seed, cancel):
                if cancel.is_set():
                    break
                self.last_progress = time.time()
                if not np.isfinite(a).all():
                    stats["anomalies"].append("nan_chunk")
                    a = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)
                if first_ms is None:
                    first_ms = now_ms() - t_start
                a = trimmer.push(a)
                if a.size == 0:
                    continue
                pcm = leveler.process(a)
                speech_samples += pcm.size
                chunks += 1
                emit(frame(F_PCM, pcm.tobytes()))
            if cancel.is_set():
                stats["cancelled"] = True
            else:
                # the model's own trailing silence is discarded here; the
                # planner owns every pause, so nothing is added.
                trimmer.flush()
                emit(frame(F_PCM, leveler.flush(192).tobytes()))
                tail = int(body.get("tail_pause_ms", 0))
                if tail > 0:
                    emit(frame(F_PCM, np.zeros(int(SAMPLE_RATE * min(tail, 1500) / 1000), np.int16).tobytes()))
            gen_ms = now_ms() - t_start
            audio_s = speech_samples / SAMPLE_RATE
            stats.update({
                "first_chunk_ms": round(first_ms or -1, 1), "gen_ms": round(gen_ms, 1), "audio_s": round(audio_s, 3),
                "rtf_x": round(audio_s / max(gen_ms / 1000, 1e-3), 3), "chunks": chunks, "chunk_size": chunk_size,
                "gain_db": round(leveler.gain_db, 2), "env_dbfs": round(leveler.env_dbfs, 2), "expected_s": round(exp_s, 2),
                "seed": seed,
            })
            if not stats.get("cancelled"):
                if audio_s < 0.35 * exp_s or audio_s < 0.2:
                    stats["anomalies"].append("too_short")
                if audio_s > 2.3 * exp_s + 1.0:
                    stats["anomalies"].append("too_long")
                if chunks and trimmer.lead_dropped > trimmer.max_lead:
                    stats["anomalies"].append("long_leading_silence")
                if audio_s > 0.5:
                    self.rtf.update(audio_s / max(gen_ms / 1000, 1e-3))
                if first_ms:
                    self.ttfa.update(first_ms)
            self.served += 1
        except Exception as e:  # noqa: BLE001
            self.failed += 1
            log.exception("job failed")
            emit(jframe(F_ERR, {"error": f"{type(e).__name__}: {e}", "gpu": ARGS.gpu}))
            stats["failed"] = True
        finally:
            if acquired:
                self.busy = False
                self.last_progress = time.time()
                self.lock.release()
                self.after_job()
            emit(jframe(F_STATS, stats))
            emit(None)

    def after_job(self):
        if MOCK:
            return
        try:
            import torch
            if self.served % 25 == 0:
                gc.collect()
                torch.cuda.empty_cache()
            v = self.engine.vram()
            max_served = int(os.environ.get("QTTS_RESTART_AFTER", "600"))
            if v["alloc_mb"] > 13500 or self.served >= max_served:
                log.warning("requesting graceful restart (alloc=%dMB served=%d)", v["alloc_mb"], self.served)
                self.restart_requested = True
        except Exception:  # noqa: BLE001
            pass


W = Worker()

# --------------------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------------------
from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # `on_event` is deprecated in modern FastAPI; the lifespan handler is the
    # supported way and keeps working when the decorator is finally removed.
    threading.Thread(target=W.boot, daemon=True, name="boot").start()
    threading.Thread(target=_restart_watch, daemon=True, name="restart-watch").start()
    yield


app = FastAPI(title=f"qtts-worker-{ARGS.gpu}", lifespan=lifespan)


def _restart_watch():
    """Exit with a dedicated code when idle and a restart was requested (supervisor restarts us)."""
    while True:
        time.sleep(1.0)
        if W.restart_requested and not W.busy:
            log.warning("graceful restart now")
            os._exit(RESTART_EXIT_CODE)


@app.get("/health")
async def health():
    d = {
        "gpu": ARGS.gpu, "ready": W.ready, "error": W.error, "busy": W.busy, "engine": W.engine.name,
        "dtype": W.engine.dtype_name, "rt": audio_rt.BACKEND, "served": W.served, "failed": W.failed,
        "rtf_x": round(W.rtf.get(0.0), 3), "first_chunk_ms": round(W.ttfa.get(0.0), 1),
        "idle_for_s": round(time.time() - W.last_progress, 1), "uptime_s": round(time.time() - W.started, 1),
        "profiles": list(W.profiles.keys()),
        "stalled_s": round(time.time() - W.last_progress, 1) if W.busy else 0.0,
        "model": MODEL_ID, "sample_rate": SAMPLE_RATE,
    }
    if W.ready and not MOCK:
        try:
            d["vram"] = W.engine.vram()
        except Exception:  # noqa: BLE001
            pass
    return d


@app.post("/profile/load")
async def profile_load(req: Request):
    body = await req.json()
    loop = asyncio.get_running_loop()
    try:
        info = await loop.run_in_executor(None, W.load_profile, str(body["profile"]))
        return {"ok": True, **info}
    except Exception as e:  # noqa: BLE001
        log.exception("profile load failed")
        return JSONResponse({"ok": False, "error": f"{type(e).__name__}: {e}"}, status_code=500)


@app.post("/synth")
async def synth(req: Request):
    body = await req.json()
    t_req = now_ms()
    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()
    cancel = threading.Event()

    def emit(item):
        loop.call_soon_threadsafe(q.put_nowait, item)

    threading.Thread(target=W.run_job, args=(body, emit, cancel, t_req), daemon=True, name="job").start()

    async def gen():
        try:
            while True:
                item = await q.get()
                if item is None:
                    break
                yield item
        finally:
            cancel.set()

    return StreamingResponse(gen(), media_type="application/octet-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    import uvicorn
    log.info("starting worker gpu=%d port=%d mock=%s rt=%s", ARGS.gpu, ARGS.port, MOCK, audio_rt.BACKEND)
    uvicorn.run(app, host=ARGS.host, port=ARGS.port, log_level="warning", access_log=False)
