"""QTTS analyst service (port 7010): Voice Lab + quality monitor.

 * builds a voice profile from many noisy, text-less reference recordings
   (decode -> measured denoise -> Whisper ASR -> candidate anchors scored on SNR / ASR confidence /
    speaker typicality / expressiveness -> real breath bank -> prosody statistics)
 * evaluates generated audio against the reference as the single anchor:
   speaker similarity (ECAPA), ASR CER, F0, speaking rate, RMS dynamics, spectrum, pauses
 * checks both GPUs for consistency and calibrates candidate anchors by synthesising on the GPU
"""
from __future__ import annotations

import asyncio
import datetime as dt
import io
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qtts_common import (  # noqa: E402
    ANALYST_PORT, MOCK, PROFILES_DIR, SAMPLE_RATE, STATE, WORKER_PORTS, count_text_units, get_logger,
    load_profile, profile_dir, read_json, slugify, write_json_atomic,
)

log = get_logger("analyst")
WORKERS = [f"http://127.0.0.1:{p}" for p in WORKER_PORTS]
SR = SAMPLE_RATE
LANG_NAME = {"zh": "Chinese", "en": "English", "ja": "Japanese", "ko": "Korean", "de": "German", "fr": "French",
             "ru": "Russian", "pt": "Portuguese", "es": "Spanish", "it": "Italian"}
TARGET_DBFS = -21.0

# ----------------------------------------------------------------------------------------
# DSP helpers
# ----------------------------------------------------------------------------------------

def decode_audio(data: bytes, name: str = "ref") -> np.ndarray:
    """Any container/codec -> mono float32 @ 24 kHz (ffmpeg, falling back to soundfile)."""
    try:
        p = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        if p.returncode == 0 and len(p.stdout) > 4:
            return np.frombuffer(p.stdout, dtype=np.float32).copy()
        err = p.stderr.decode("utf-8", "ignore")[:200]
    except (OSError, subprocess.TimeoutExpired) as e:
        err = str(e)
    try:
        import soundfile as sf
        y, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
        if y.ndim > 1:
            y = y.mean(axis=1)
        return resample(y, sr, SR)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"cannot decode {name}: {err or e}") from e


def resample(y: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out:
        return y.astype(np.float32)
    from math import gcd
    from scipy.signal import resample_poly
    g = gcd(sr_in, sr_out)
    return resample_poly(y, sr_out // g, sr_in // g).astype(np.float32)


def to16k(y24: np.ndarray) -> np.ndarray:
    return resample(y24, SR, 16000)


def highpass(y: np.ndarray, sr: int, fc: float = 55.0) -> np.ndarray:
    from scipy.signal import butter, sosfiltfilt
    sos = butter(4, fc / (sr / 2), btype="high", output="sos")
    return sosfiltfilt(sos, y).astype(np.float32)


def frame_rms_db(y: np.ndarray, sr: int, win_ms: float = 20.0) -> np.ndarray:
    n = max(int(sr * win_ms / 1000), 1)
    m = (len(y) // n) * n
    if m == 0:
        return np.full(1, -90.0)
    r = np.sqrt(np.mean(y[:m].reshape(-1, n).astype(np.float64) ** 2, axis=1))
    return 20 * np.log10(np.maximum(r, 1e-7))


def estimate_snr(y: np.ndarray, sr: int) -> float:
    db = frame_rms_db(y, sr)
    if db.size < 10:
        return 0.0
    return float(np.percentile(db, 92) - np.percentile(db, 8))


def speech_rms_dbfs(y: np.ndarray, sr: int) -> float:
    db = frame_rms_db(y, sr)
    thr = np.percentile(db, 92) - 25
    sel = db[db > max(thr, -55)]
    if sel.size == 0:
        return float(np.percentile(db, 90))
    return float(10 * np.log10(np.mean(10 ** (sel / 10))))


def normalize_speech(y: np.ndarray, sr: int, target: float = TARGET_DBFS) -> np.ndarray:
    g = float(np.clip(target - speech_rms_dbfs(y, sr), -14, 14))
    out = y * (10 ** (g / 20))
    pk = float(np.max(np.abs(out)) + 1e-9)
    if pk > 0.95:
        out = out * (0.95 / pk)
    return out.astype(np.float32)


def denoise(y: np.ndarray, sr: int, strength: float) -> np.ndarray:
    import noisereduce as nr
    return nr.reduce_noise(y=y, sr=sr, stationary=False, prop_decrease=strength, n_fft=1024,
                           time_mask_smooth_ms=60, freq_mask_smooth_hz=400).astype(np.float32)


def f0_track(y16: np.ndarray, accurate: bool = False) -> np.ndarray:
    """Hz per frame (nan = unvoiced)."""
    import librosa
    if y16.size < 2048:
        return np.zeros(0)
    if accurate:
        f0, vf, _ = librosa.pyin(y16, fmin=60, fmax=450, sr=16000, frame_length=1024, hop_length=320)
        return np.where(vf, f0, np.nan)
    f0 = librosa.yin(y16, fmin=60, fmax=450, sr=16000, frame_length=1024, hop_length=160)
    db = frame_rms_db(y16, 16000, 10.0)
    n = min(len(f0), len(db))
    f0, db = f0[:n], db[:n]
    thr = np.percentile(db, 90) - 28
    out = np.where((db > thr) & (f0 > 65) & (f0 < 420), f0, np.nan)
    return out


def f0_stats(f0: np.ndarray) -> dict:
    v = f0[~np.isnan(f0)] if f0.size else f0
    if v.size < 10:
        return {"median": 0.0, "p10": 0.0, "p90": 0.0, "std_st": 0.0, "voiced_ratio": 0.0}
    st = 12 * np.log2(v / np.median(v))
    return {"median": float(np.median(v)), "p10": float(np.percentile(v, 10)), "p90": float(np.percentile(v, 90)),
            "std_st": float(np.std(st)), "voiced_ratio": float(v.size / max(f0.size, 1))}


def log_mel_profile(y: np.ndarray) -> np.ndarray:
    import librosa
    m = librosa.feature.melspectrogram(y=y, sr=SR, n_fft=1024, hop_length=256, n_mels=64, fmin=50, fmax=11000)
    lm = 10 * np.log10(np.maximum(m, 1e-10))
    db = 10 * np.log10(np.maximum(m.sum(axis=0), 1e-10))
    act = db > (np.percentile(db, 95) - 25)  # speech frames only
    if act.sum() < 5:
        act[:] = True
    return lm[:, act].mean(axis=1)


def edit_distance(a: str, b: str) -> int:
    if not a:
        return len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


_NORM_RE = re.compile(r"[\W_]+", re.UNICODE)


def norm_text(s: str) -> str:
    return _NORM_RE.sub("", s.lower())


def cer(ref: str, hyp: str) -> float:
    r, h = norm_text(ref), norm_text(hyp)
    if not r:
        return 0.0
    return min(edit_distance(r, h) / len(r), 1.0)


# ----------------------------------------------------------------------------------------
# Models (lazy)
# ----------------------------------------------------------------------------------------
class SpeakerModel:
    def __init__(self):
        self.enc = None
        self.method = "unloaded"
        self.lock = threading.Lock()

    def load(self):
        with self.lock:
            if self.method != "unloaded":
                return
            if MOCK:
                self.method = "mfcc-proxy"
                return
            try:
                try:
                    from speechbrain.inference.speaker import EncoderClassifier
                except ImportError:
                    from speechbrain.pretrained import EncoderClassifier  # type: ignore
                self.enc = EncoderClassifier.from_hparams(
                    source="speechbrain/spkrec-ecapa-voxceleb", savedir=str(STATE / "models" / "ecapa"),
                    run_opts={"device": "cpu"})
                self.method = "ecapa"
                log.info("speaker model: ECAPA-TDNN (cpu)")
            except Exception as e:  # noqa: BLE001
                self.method = "mfcc-proxy"
                log.warning("ECAPA unavailable (%s); using MFCC proxy (less discriminative!)", e)

    def embed(self, y16: np.ndarray) -> np.ndarray:
        self.load()
        y16 = np.asarray(y16, dtype=np.float32)
        if y16.size < 8000:
            y16 = np.pad(y16, (0, 8000 - y16.size))
        if self.enc is not None:
            import torch
            with torch.no_grad():
                e = self.enc.encode_batch(torch.from_numpy(y16).unsqueeze(0)).squeeze().cpu().numpy()
        else:
            import librosa
            mf = librosa.feature.mfcc(y=y16, sr=16000, n_mfcc=24)
            e = np.concatenate([mf.mean(axis=1), mf.std(axis=1)])
            e = e - 0.0
        e = np.asarray(e, dtype=np.float64).reshape(-1)
        return e / (np.linalg.norm(e) + 1e-9)

    @staticmethod
    def sim(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


class ASRModel:
    """faster-whisper wrapper.

    The device policy matters on a 16 GB T4: the GPU already hosts the 1.7B TTS
    model (weights + static KV cache + codec).  Loading whisper large-v3 on the
    same card can OOM the whole worker, so the *reference* transcriber runs on
    the CPU by default and the real-time *chat* transcriber uses a small CPU
    model.  Set QTTS_ASR_DEVICE=cuda to force the GPU.
    """

    def __init__(self, device_pref: str = "auto", model: str | None = None, beam: int = 5):
        self.model = None
        self.name = "none"
        self.lock = threading.Lock()
        self.device_pref = device_pref
        self.model_id = model
        self.beam = beam

    def _gpu_ok(self) -> bool:
        pref = (os.environ.get("QTTS_ASR_DEVICE", "cpu") or "cpu").lower()
        if pref == "cuda":
            return True
        if pref == "auto":
            try:
                import torch
                if not torch.cuda.is_available():
                    return False
                free, _ = torch.cuda.mem_get_info()
                return free > (6 * 1024 ** 3)  # need ~6 GB free on the card
            except Exception:  # noqa: BLE001
                return False
        return False

    def load(self):
        with self.lock:
            if self.model is not None or MOCK:
                return
            from faster_whisper import WhisperModel
            size = self.model_id or os.environ.get("QTTS_ASR", "large-v3")
            if self._gpu_ok():
                try:
                    self.model = WhisperModel(size, device="cuda", device_index=0, compute_type="float16")
                    self.name = f"{size}/cuda-fp16"
                except Exception as e:  # noqa: BLE001
                    log.warning("whisper on GPU failed (%s); falling back to CPU", e)
                    self.model = None
            if self.model is None:
                cpu_size = os.environ.get("QTTS_ASR_CPU", "small")
                self.model = WhisperModel(cpu_size, device="cpu", compute_type="int8")
                self.name = f"{cpu_size}/cpu-int8"
            log.info("ASR ready: %s", self.name)

    def unload(self):
        with self.lock:
            self.model = None
        import gc
        gc.collect()

    def transcribe(self, y16: np.ndarray, language: str | None = None):
        """-> (language, [ {start,end,text,logprob,words:[(s,e,w)]} ])"""
        if MOCK:
            dur = len(y16) / 16000
            segs, t = [], 0.0
            while t < dur - 0.2:
                e = min(t + 3.5, dur)
                segs.append({"start": t, "end": e, "text": "这是一段用来测试的参考语音内容，", "logprob": -0.2,
                             "words": [(t + 0.3, t + 0.6, "测试，")]})
                t = e + 0.5
            if not segs and dur > 0.1:
                segs.append({"start": 0.0, "end": dur, "text": "这是一段用来测试的参考语音内容，",
                             "logprob": -0.2, "words": []})
            return "zh", segs
        self.load()
        prompt = "以下是普通话的句子。" if language in (None, "zh") else None

        def run():
            it, info = self.model.transcribe(
                y16, language=language, beam_size=self.beam, vad_filter=True, word_timestamps=True,
                condition_on_previous_text=False, temperature=0.0, initial_prompt=prompt)
            out = []
            for s in it:  # generator is lazy: cuDNN/CUDA errors surface here, not at load time
                words = [(w.start, w.end, w.word) for w in (s.words or [])]
                out.append({"start": float(s.start), "end": float(s.end), "text": s.text.strip(),
                            "logprob": float(s.avg_logprob), "words": words})
            return info.language, out

        try:
            return run()
        except Exception as e:  # noqa: BLE001
            if "cpu" in self.name:
                raise
            log.warning("whisper GPU inference failed (%s); switching to CPU model", str(e)[:160])
            from faster_whisper import WhisperModel
            self.model = WhisperModel(os.environ.get("QTTS_ASR_CPU", "small"), device="cpu", compute_type="int8")
            self.name = "cpu-int8"
            return run()


SPK = SpeakerModel()
ASR = ASRModel()
# Real-time transcriber for the voice chat: small + CPU int8 -> ~0.2-0.5 s for a
# 3 second utterance on a Kaggle CPU, and it never competes for T4 VRAM.
CHAT_ASR = ASRModel(model=os.environ.get("QTTS_CHAT_ASR_MODEL", "base"), beam=1)

# ----------------------------------------------------------------------------------------
# Worker helpers
# ----------------------------------------------------------------------------------------

def worker_post(i: int, path: str, body: dict, timeout=600):
    import requests
    return requests.post(WORKERS[i] + path, json=body, timeout=timeout)


def synth_full(i: int, pid: str, text: str, seed: int = 1, language: str = "Auto"):
    """Run one non-interactive synthesis on worker i. Returns (float32 audio @24k, stats)."""
    import requests
    r = requests.post(WORKERS[i] + "/synth", json={"profile": pid, "text": text, "language": language, "seed": seed,
                                                    "chunk_size": 12}, stream=True, timeout=(5, 300))
    buf = bytearray()
    pcm = bytearray()
    stats = {}
    for chunk in r.iter_content(None):
        buf += chunk
        while len(buf) >= 5:
            t, ln = struct.unpack("<BI", buf[:5])
            if len(buf) < 5 + ln:
                break
            payload = bytes(buf[5:5 + ln])
            del buf[:5 + ln]
            if t == 1:
                pcm += payload
            elif t == 2:
                import json
                stats = json.loads(payload)
            elif t == 3:
                import json
                raise RuntimeError(json.loads(payload).get("error", "worker error"))
    return np.frombuffer(bytes(pcm), dtype=np.int16).astype(np.float32) / 32768.0, stats


def load_on_workers(pid: str) -> list[dict]:
    out = []
    for i in range(len(WORKERS)):
        try:
            r = worker_post(i, "/profile/load", {"profile": pid}, timeout=900)
            out.append(r.json())
        except Exception as e:  # noqa: BLE001
            out.append({"ok": False, "error": str(e)})
    return out


# ----------------------------------------------------------------------------------------
# Evaluation
# ----------------------------------------------------------------------------------------

def _clip01(x: float) -> float:
    return float(min(max(x, 0.0), 1.0))


def load_ref_stats(pid: str) -> dict:
    d = profile_dir(pid)
    prof = load_profile(pid)
    if not prof:
        raise FileNotFoundError(pid)
    cen = None
    if (d / "centroid.npy").exists():
        cen = np.load(d / "centroid.npy")
    ref, _ = _read_wav(d / prof["anchor"])
    return {"prof": prof, "centroid": cen, "ref": ref}


def _read_wav(path: Path):
    import soundfile as sf
    y, sr = sf.read(str(path), dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    return resample(y, sr, SR), SR


def evaluate_audio(gen: np.ndarray, pid: str, text: str | None = None, ref=None) -> dict:
    ref = ref or load_ref_stats(pid)
    prof, centroid, refw = ref["prof"], ref["centroid"], ref["ref"]
    gen = np.asarray(gen, dtype=np.float32)
    dur = len(gen) / SR
    m: dict = {"duration_s": round(dur, 2), "speaker_model": SPK.method}
    if dur < 0.5:
        return {**m, "error": "audio too short"}
    g16, r16 = to16k(gen), to16k(refw)
    eg = SPK.embed(g16)
    er = SPK.embed(r16)
    m["speaker_sim_anchor"] = round(SPK.sim(eg, er), 4)
    m["speaker_sim_centroid"] = round(SPK.sim(eg, centroid), 4) if centroid is not None else None
    sim = m["speaker_sim_centroid"] if m["speaker_sim_centroid"] is not None else m["speaker_sim_anchor"]
    # F0
    fg, fr = f0_stats(f0_track(g16, True)), f0_stats(f0_track(r16, True))
    m["f0_gen"], m["f0_ref"] = fg, fr
    cents = 1200 * np.log2(max(fg["median"], 1) / max(fr["median"], 1)) if fg["median"] and fr["median"] else 999.0
    m["f0_median_diff_cents"] = round(float(cents), 1)
    m["f0_range_ratio"] = round(fg["std_st"] / max(fr["std_st"], 0.1), 2)
    # energy dynamics
    def dyn(y):
        db = frame_rms_db(y, SR, 50.0)
        hi = np.percentile(db, 95)
        sp = db[db > hi - 35]
        return {"speech_db": float(speech_rms_dbfs(y, SR)), "range_db": float(np.percentile(sp, 95) - np.percentile(sp, 10)),
                "std_db": float(np.std(sp))}
    dg, drf = dyn(gen), dyn(refw)
    m["energy_gen"], m["energy_ref"] = {k: round(v, 2) for k, v in dg.items()}, {k: round(v, 2) for k, v in drf.items()}
    # spectrum
    sg, sr_ = log_mel_profile(gen), log_mel_profile(refw)
    off = float(np.mean(sg) - np.mean(sr_))
    m["spectral_dist_db"] = round(float(np.mean(np.abs((sg - sg.mean()) - (sr_ - sr_.mean())))), 2)
    m["spectral_level_offset_db"] = round(off, 2)
    # pauses / breath-like
    db = frame_rms_db(gen, SR, 20.0)
    sil = db < (np.percentile(db, 95) - 38)
    m["silence_ratio"] = round(float(sil.mean()), 3)
    # ASR -> CER, speaking rate
    cer_v = None
    if text:
        try:
            lang, segs = ASR.transcribe(g16, None)
            hyp = "".join(s["text"] for s in segs)
            cer_v = cer(text, hyp)
            m["asr_text"] = hyp[:300]
            m["cer"] = round(cer_v, 4)
        except Exception as e:  # noqa: BLE001
            m["cer_error"] = str(e)[:120]
    if text:
        voiced = float((~sil).sum() * 0.02)
        m["rate_units_per_s"] = round(count_text_units(text) / max(voiced, 0.5), 2)
        ref_ups = float(prof.get("units_per_sec", 0) or 0)
        m["rate_ref_units_per_s"] = round(ref_ups, 2)
        rate_ratio = m["rate_units_per_s"] / ref_ups if ref_ups else 1.0
        m["rate_ratio"] = round(rate_ratio, 3)
    else:
        rate_ratio = 1.0
    # transparent internal index (NOT a similarity percentage)
    parts = {
        "speaker": _clip01((sim - 0.45) / 0.4),
        "pronunciation": 1.0 - _clip01((cer_v if cer_v is not None else 0.05) / 0.15),
        "f0": 1.0 - _clip01(abs(cents) / 300.0) * 0.6 - _clip01(abs(m["f0_range_ratio"] - 1) / 1.0) * 0.4,
        "rate": 1.0 - _clip01(abs(rate_ratio - 1.0) / 0.4),
        "spectrum": 1.0 - _clip01(m["spectral_dist_db"] / 8.0),
        "energy": 1.0 - _clip01(abs(dg["range_db"] - drf["range_db"]) / 10.0),
    }
    w = {"speaker": 0.40, "pronunciation": 0.15, "f0": 0.15, "rate": 0.10, "spectrum": 0.10, "energy": 0.10}
    m["index_parts"] = {k: round(v, 3) for k, v in parts.items()}
    m["fidelity_index"] = round(100 * sum(parts[k] * w[k] for k in w), 1)
    flags = []
    if sim < 0.70:
        flags.append("speaker similarity low: improve the reference (cleaner / longer / more typical)")
    if cer_v is not None and cer_v > 0.08:
        flags.append("pronunciation errors: check ref_text accuracy")
    if abs(cents) > 200:
        flags.append("pitch offset > 200 cents")
    if abs(rate_ratio - 1) > 0.25:
        flags.append("speaking rate differs > 25% from reference")
    m["flags"] = flags
    return m


# ----------------------------------------------------------------------------------------
# Profile building
# ----------------------------------------------------------------------------------------
JOBS: dict[str, dict] = {}
BUILD_LOCK = threading.Lock()


def jlog(job: dict, pct: float, msg: str):
    job["pct"] = round(pct, 1)
    job["stage"] = msg
    job["log"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    log.info("job %s %5.1f%% %s", job["id"], pct, msg)


def write_wav(path: Path, y: np.ndarray, sr: int = SR):
    import soundfile as sf
    sf.write(str(path), np.clip(y, -1, 1), sr, subtype="PCM_16")


def find_breaths(y: np.ndarray, gaps: list[tuple[float, float]]):
    """Look for real inhales inside the pauses between phrases: noisy, quiet, 120-650 ms."""
    import librosa
    out = []
    hop = 120  # 5 ms
    for (a, b) in gaps:
        s, e = int(max(a - 0.05, 0) * SR), int(min(b + 0.05, len(y) / SR) * SR)
        seg = y[s:e]
        if seg.size < SR * 0.18:
            continue
        flat = librosa.feature.spectral_flatness(y=seg, n_fft=512, hop_length=hop)[0]
        db = frame_rms_db(seg[: (len(seg) // hop) * hop], SR, hop / SR * 1000)
        n = min(len(flat), len(db))
        ok = (db[:n] > -50) & (db[:n] < -27) & (flat[:n] > 0.12)
        i = 0
        while i < n:
            if ok[i]:
                j = i
                while j < n and ok[j]:
                    j += 1
                dur = (j - i) * hop / SR
                if 0.12 <= dur <= 0.65:
                    c0 = max(0, i * hop - int(0.02 * SR))
                    c1 = min(len(seg), j * hop + int(0.03 * SR))
                    clip = seg[c0:c1].copy()
                    score = float(flat[i:j].mean()) * dur
                    out.append((score, clip, float(db[i:j].mean())))
                i = j
            else:
                i += 1
    out.sort(key=lambda t: -t[0])
    return out[:6]


def build_profile(job: dict, name: str, files: list[tuple[str, bytes]], language: str, manual_text: str, calibrate: bool):
    t_start = time.time()
    quality: dict = {"files": []}
    pid = f"{slugify(name)}-{uuid.uuid4().hex[:5]}"
    d = profile_dir(pid)
    d.mkdir(parents=True, exist_ok=True)
    try:
        SPK.load()
        quality["speaker_model"] = SPK.method
        lang_hint = {"chinese": "zh", "english": "en", "japanese": "ja", "korean": "ko"}.get(language.lower())
        # ---- 1. decode + measured cleaning ------------------------------------------------
        cleaned: list[tuple[str, np.ndarray]] = []
        for k, (fn, data) in enumerate(files):
            jlog(job, 3 + 22 * k / max(len(files), 1), f"decode + denoise {fn}")
            raw = decode_audio(data, fn)[: SR * 240]
            if raw.size < SR * 1.5:
                quality["files"].append({"file": fn, "skipped": "shorter than 1.5 s"})
                continue
            raw = highpass(raw, SR)
            snr0 = estimate_snr(raw, SR)
            info = {"file": fn, "duration_s": round(len(raw) / SR, 1), "snr_db": round(snr0, 1),
                    "peak": round(float(np.max(np.abs(raw))), 3)}
            pick, why = raw, "kept raw (already clean)"
            if snr0 < 30:
                probe = raw[SR: SR * 11] if raw.size > SR * 12 else raw
                e_raw = SPK.embed(to16k(probe))
                best = None
                for strength in (0.85, 0.55):
                    try:
                        c = denoise(raw, SR, strength)
                    except Exception as e:  # noqa: BLE001
                        why = f"denoise unavailable ({e})"
                        break
                    cp = c[SR: SR * 11] if c.size > SR * 12 else c
                    s = SPK.sim(e_raw, SPK.embed(to16k(cp)))
                    snr1 = estimate_snr(c, SR)
                    info[f"denoise_{strength}"] = {"timbre_sim": round(s, 3), "snr_db": round(snr1, 1)}
                    # accept only if timbre is preserved AND noise measurably dropped
                    if s >= 0.94 and snr1 > snr0 + 2.0:
                        best = (c, f"denoised strength {strength} (timbre kept {s:.3f}, SNR {snr0:.1f}->{snr1:.1f} dB)")
                        break
                if best:
                    pick, why = best
                elif why == "kept raw (already clean)":
                    why = "kept raw (denoise would damage timbre or gave no gain)"
            info["decision"] = why
            quality["files"].append(info)
            cleaned.append((fn, normalize_speech(pick, SR)))
        if not cleaned:
            raise ValueError("no usable audio (every file shorter than 1.5 s or undecodable)")

        # ---- 2. transcription -----------------------------------------------------------
        clips = []  # dicts: file idx, y, start, end, text, logprob
        words_all = []
        ref_lang = lang_hint
        try:
            for k, (fn, y) in enumerate(cleaned):
                jlog(job, 28 + 25 * k / len(cleaned), f"ASR {fn}")
                if manual_text and len(cleaned) == 1 and len(y) / SR <= 16:
                    segs = [{"start": 0.0, "end": len(y) / SR, "text": manual_text.strip(), "logprob": 0.0, "words": []}]
                    lg = lang_hint or "zh"
                else:
                    lg, segs = ASR.transcribe(to16k(y), lang_hint)
                ref_lang = ref_lang or lg
                quality.setdefault("asr", []).append({"file": fn, "language": lg, "segments": len(segs),
                                                      "engine": ASR.name})
                for s in segs:
                    if s["text"].strip():
                        clips.append({"f": k, "start": s["start"], "end": s["end"], "text": s["text"],
                                      "logprob": s["logprob"]})
                        words_all.extend([(k, a, b, w) for a, b, w in s["words"]])
        finally:
            if not MOCK:
                ASR.unload()
        if not clips:
            raise ValueError("ASR found no speech. Provide cleaner audio or type the transcript manually.")
        ref_lang = ref_lang or "zh"

        # ---- 3. candidate anchors ----------------------------------------------------------
        jlog(job, 55, "scoring candidate anchors")
        f0_by_file = {}
        for k, (fn, y) in enumerate(cleaned):
            f0_by_file[k] = f0_track(to16k(y))
        cands = []
        for k, (fn, y) in enumerate(cleaned):
            ss = [c for c in clips if c["f"] == k]
            for i in range(len(ss)):
                j, st, en, txt, lps = i, ss[i]["start"], ss[i]["end"], ss[i]["text"], [ss[i]["logprob"]]
                while True:
                    dur = en - st
                    if 5.0 <= dur <= 14.0:
                        cands.append({"f": k, "start": st, "end": en, "text": txt, "logprob": float(np.mean(lps))})
                    if dur >= 12.0 or j + 1 >= len(ss) or ss[j + 1]["start"] - en > 1.0 or ss[j + 1]["end"] - st > 14.0:
                        break
                    j += 1
                    en = ss[j]["end"]
                    txt = txt + (" " if re.search(r"[A-Za-z]$", txt) else "") + ss[j]["text"]
                    lps.append(ss[j]["logprob"])
        if not cands:  # no 5-14 s window: take the longest single segments (>= 2.5 s)
            for c in sorted(clips, key=lambda c: c["start"] - c["end"])[:6]:
                if c["end"] - c["start"] >= 2.5:
                    cands.append({"f": c["f"], "start": c["start"], "end": min(c["end"], c["start"] + 14),
                                  "text": c["text"], "logprob": c["logprob"]})
        if not cands:
            raise ValueError("no continuous speech >= 2.5 s found; record a longer continuous passage")
        # embeddings for typicality: cheap pre-rank, then cap (ECAPA on CPU is the slow part)
        cands.sort(key=lambda c: -(0.5 * _clip01(1 - abs((c["end"] - c["start"]) - 10) / 8)
                                   + 0.5 * _clip01(float(np.exp(c["logprob"])))))
        cands = cands[:24]
        for c in cands:
            y = cleaned[c["f"]][1]
            seg = y[int(max(c["start"] - 0.05, 0) * SR): int((c["end"] + 0.08) * SR)]
            c["y"] = seg
            c["emb"] = SPK.embed(to16k(seg))
            c["snr"] = estimate_snr(seg, SR)
            f0 = f0_by_file[c["f"]][int(c["start"] * 100): int(c["end"] * 100)]
            c["f0std"] = f0_stats(f0)["std_st"]
            c["peak"] = float(np.max(np.abs(seg))) if seg.size else 1.0
        embs = np.stack([c["emb"] for c in cands])
        centroid = embs.mean(axis=0)
        centroid /= np.linalg.norm(centroid) + 1e-9
        for c in cands:
            dur = c["end"] - c["start"]
            units = count_text_units(c["text"])
            rate = units / max(dur, 0.1)
            typical = _clip01((SPK.sim(c["emb"], centroid) - 0.5) / 0.5)
            c["score"] = (0.28 * _clip01(1 - abs(dur - 10) / 8) + 0.20 * _clip01(c["snr"] / 35)
                          + 0.25 * _clip01(np.exp(c["logprob"])) + 0.15 * typical
                          + 0.07 * _clip01(c["f0std"] / 4.0) + 0.05 * (1.0 if 2.0 <= rate <= 9.0 else 0.0))
            if c["peak"] > 0.985:
                c["score"] *= 0.7
        cands.sort(key=lambda c: -c["score"])
        picked = []
        for c in cands:  # top-3 that are not near-duplicates (>40% overlap in same file)
            if all(not (p["f"] == c["f"] and min(p["end"], c["end"]) - max(p["start"], c["start"]) > 0.4 * (c["end"] - c["start"]))
                   for p in picked):
                picked.append(c)
            if len(picked) == 3:
                break
        cand_meta = []
        for k, c in enumerate(picked):
            seg = c["y"].copy()
            w = 120
            seg[:w] *= np.linspace(0, 1, w, dtype=np.float32)
            seg[-w:] *= np.linspace(1, 0, w, dtype=np.float32)
            fn_ = f"cand{k}.wav"
            write_wav(d / fn_, seg)
            cand_meta.append({"file": fn_, "text": c["text"], "start": round(c["start"], 2), "end": round(c["end"], 2),
                              "score": round(float(c["score"]), 3), "snr_db": round(float(c["snr"]), 1),
                              "asr_conf": round(float(np.exp(c["logprob"])), 3), "from": cleaned[c["f"]][0]})
        np.save(d / "centroid.npy", centroid.astype(np.float32))

        # ---- 4. breath bank + prosody ------------------------------------------------------
        jlog(job, 70, "extracting real breaths + prosody statistics")
        gaps_by_file: dict[int, list[tuple[float, float]]] = {}
        for k in range(len(cleaned)):
            ss = sorted([c for c in clips if c["f"] == k], key=lambda c: c["start"])
            g = []
            if ss and ss[0]["start"] > 0.3:
                g.append((0.0, ss[0]["start"]))
            for a, b in zip(ss, ss[1:]):
                if b["start"] - a["end"] >= 0.25:
                    g.append((a["end"], b["start"]))
            gaps_by_file[k] = g
        breaths = []
        for k, (fn, y) in enumerate(cleaned):
            breaths += find_breaths(y, gaps_by_file[k])
        breaths.sort(key=lambda t: -t[0])
        breath_files = []
        for i, (_, clip, dbm) in enumerate(breaths[:5]):
            w = 96
            clip[:w] *= np.linspace(0, 1, w, dtype=np.float32)
            clip[-w:] *= np.linspace(1, 0, w, dtype=np.float32)
            write_wav(d / f"breath{i}.wav", clip)
            breath_files.append(f"breath{i}.wav")
        breath_db = float(np.median([b[2] for b in breaths[:5]])) if breaths else -38.0
        # pause statistics from word gaps
        clause_gaps, sent_gaps = [], []
        words_all.sort(key=lambda t: (t[0], t[1]))
        for (f1, a1, b1, w1), (f2, a2, b2, w2) in zip(words_all, words_all[1:]):
            if f1 != f2:
                continue
            gap = a2 - b1
            if 0.10 <= gap <= 1.6:
                end_ch = w1.strip()[-1:] if w1.strip() else ""
                if end_ch in "。！？.!?…":
                    sent_gaps.append(gap)
                elif end_ch in "，,、；;：:":
                    clause_gaps.append(gap)
        ups_num = sum(count_text_units(c["text"]) for c in clips)
        ups_den = sum(c["end"] - c["start"] for c in clips)
        ups = float(np.clip(ups_num / max(ups_den, 1.0), 2.5, 9.0))
        pc = int(np.clip(np.median(clause_gaps) * 1000, 80, 400)) if len(clause_gaps) >= 4 else 150
        ps = int(np.clip(np.median(sent_gaps) * 1000, 180, 800)) if len(sent_gaps) >= 3 else int(max(pc * 2.2, 320))
        best_y = picked[0]["y"]
        f0s = f0_stats(f0_track(to16k(best_y), accurate=True))
        target_db = TARGET_DBFS

        # ---- 5. profile json ----------------------------------------------------------------
        anchor_name = "anchor_0.wav"
        shutil.copy(d / "cand0.wav", d / anchor_name)
        prof = {
            "id": pid, "name": name, "language": LANG_NAME.get(ref_lang, "Auto"), "lang_code": ref_lang,
            "created": dt.datetime.now().isoformat(timespec="seconds"),
            "anchor": anchor_name, "anchor_candidate": 0, "ref_text": cand_meta[0]["text"],
            "candidates": cand_meta, "target_rms_dbfs": target_db, "units_per_sec": round(ups, 3),
            "pause_clause_ms": pc, "pause_sentence_ms": ps, "pause_para_ms": int(ps * 1.65),
            "breath_files": breath_files, "breath_level_db": round(breath_db, 1),
            "f0": f0s, "gen": {"temperature": 0.8, "top_k": 50, "top_p": 1.0, "repetition_penalty": 1.05},
            "quality": quality, "speaker_model": SPK.method,
            "stats": {"clips": len(clips), "candidates": len(cands), "clause_gaps": len(clause_gaps),
                      "sentence_gaps": len(sent_gaps), "breaths_found": len(breaths)},
        }
        write_json_atomic(d / "profile.json", prof)
        jlog(job, 82, "loading profile on both GPU workers (voice-clone prompt cache)")
        loads = load_on_workers(pid)
        prof["worker_load"] = loads
        write_json_atomic(d / "profile.json", prof)
        job["profile"] = pid
        if calibrate and any(l.get("ok") for l in loads) and len(cand_meta) > 1 and not MOCK:
            jlog(job, 88, "calibrating candidate anchors on the GPU (speaker sim + CER)")
            try:
                calibrate_profile(pid, job)
            except Exception as e:  # noqa: BLE001
                log.exception("calibration failed")
                jlog(job, 97, f"calibration skipped: {e}")
        quality["build_s"] = round(time.time() - t_start, 1)
        jlog(job, 100, f"done in {quality['build_s']} s")
        job["state"] = "done"
    except Exception as e:  # noqa: BLE001
        log.exception("profile build failed")
        job["state"] = "error"
        job["error"] = f"{type(e).__name__}: {e}"
        jlog(job, job.get("pct", 0), f"FAILED: {e}")
        shutil.rmtree(d, ignore_errors=True)


CAL_TEXTS = ["今天天气不错，我们一起出去走走吧。", "Sometimes the quiet moments say the most, don't you think?"]


def calibrate_profile(pid: str, job: dict | None = None) -> dict:
    """Synthesise with every candidate anchor, score vs the profile centroid, keep the best one."""
    prof = load_profile(pid)
    d = profile_dir(pid)
    cen = np.load(d / "centroid.npy") if (d / "centroid.npy").exists() else None
    results = []
    for k, c in enumerate(prof["candidates"]):
        tid = f"_cal_{pid}_{k}"
        td = profile_dir(tid)
        td.mkdir(parents=True, exist_ok=True)
        shutil.copy(d / c["file"], td / "anchor_tmp.wav")
        p2 = dict(prof)
        p2.update({"id": tid, "anchor": "anchor_tmp.wav", "ref_text": c["text"], "breath_files": []})
        write_json_atomic(td / "profile.json", p2)
        try:
            r = worker_post(0, "/profile/load", {"profile": tid}, timeout=600).json()
            if not r.get("ok"):
                raise RuntimeError(r.get("error"))
            sims, cers = [], []
            for ti, txt in enumerate(CAL_TEXTS):
                y, _ = synth_full(0, tid, txt, seed=11 + ti)
                e = SPK.embed(to16k(y))
                sims.append(SPK.sim(e, cen) if cen is not None else 0.0)
                if SPK.method == "ecapa" or not MOCK:
                    try:
                        _, segs = ASR.transcribe(to16k(y), None)
                        cers.append(cer(txt, "".join(s["text"] for s in segs)))
                    except Exception:  # noqa: BLE001
                        pass
            sim = float(np.mean(sims))
            ce = float(np.mean(cers)) if cers else 0.05
            results.append({"candidate": k, "sim": round(sim, 4), "cer": round(ce, 4),
                            "score": round(sim - 1.5 * ce, 4)})
        except Exception as e:  # noqa: BLE001
            results.append({"candidate": k, "error": str(e)[:200], "score": -9})
        finally:
            shutil.rmtree(td, ignore_errors=True)
    ASR.unload()
    best = max(results, key=lambda r: r["score"])
    prof = load_profile(pid)
    prof["calibration"] = {"results": results, "chosen": best["candidate"]}
    if best["score"] > -9 and best["candidate"] != prof.get("anchor_candidate", 0):
        c = prof["candidates"][best["candidate"]]
        newname = f"anchor_{best['candidate']}.wav"
        shutil.copy(d / c["file"], d / newname)
        prof.update({"anchor": newname, "anchor_candidate": best["candidate"], "ref_text": c["text"]})
    write_json_atomic(d / "profile.json", prof)
    load_on_workers(pid)
    if job:
        jlog(job, 97, f"calibration chose candidate {best['candidate']} {results}")
    return prof["calibration"]


# ----------------------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------------------
from fastapi import FastAPI, File, Form, UploadFile  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

app = FastAPI(title="qtts-analyst")


def _err(msg, code=400):
    return JSONResponse({"error": msg}, status_code=code)


@app.get("/health")
async def health():
    return {"ok": True, "speaker_model": SPK.method, "asr": ASR.name, "chat_asr": CHAT_ASR.name,
            "mock": MOCK, "jobs": len(JOBS), "workers": WORKERS}


@app.post("/asr")
async def asr_ep(file: UploadFile = File(...), language: str = Form("")):
    """Real-time speech-to-text for the voice chat.

    Accepts any container the server can decode (the browser sends 16 kHz mono
    WAV, but webm/opus/mp3 also work through ffmpeg).
    """
    data = await file.read()
    if not data:
        return _err("empty audio")
    loop = asyncio.get_running_loop()

    def work():
        y = decode_audio(data, file.filename or "mic")
        y16 = to16k(y)
        dur = len(y16) / 16000
        if dur < 0.25:
            raise ValueError("recording too short")
        lang_hint = None
        if language:
            lang_hint = {"chinese": "zh", "english": "en", "japanese": "ja", "korean": "ko"}.get(
                language.lower().strip())
        lg, segs = CHAT_ASR.transcribe(y16, lang_hint)
        text = "".join(s["text"] for s in segs).strip()
        return {"text": text, "language": lg, "duration_s": round(dur, 2),
                "segments": [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in segs],
                "engine": CHAT_ASR.name}

    try:
        return await loop.run_in_executor(None, work)
    except Exception as e:  # noqa: BLE001
        log.warning("asr failed: %s", e)
        return _err(f"{type(e).__name__}: {e}", 500)


@app.get("/profiles")
async def profiles():
    out = []
    for p in sorted(PROFILES_DIR.iterdir()) if PROFILES_DIR.exists() else []:
        if p.is_dir() and not p.name.startswith("_cal_"):
            pr = read_json(p / "profile.json")
            if pr:
                pr = {k: v for k, v in pr.items() if k not in ("worker_load",)}
                out.append(pr)
    out.sort(key=lambda x: x.get("created", ""), reverse=True)
    return {"profiles": out}


@app.post("/profiles")
async def create_profile(name: str = Form("my-voice"), language: str = Form("auto"), ref_text: str = Form(""),
                         calibrate: str = Form("1"), files: list[UploadFile] = File(...)):
    blobs = []
    for f in files:
        blobs.append((f.filename or "audio", await f.read()))
    if not blobs:
        return _err("upload at least one audio file")
    job = {"id": uuid.uuid4().hex[:8], "state": "running", "pct": 0, "stage": "queued", "log": [], "profile": None}
    JOBS[job["id"]] = job

    def runner():
        with BUILD_LOCK:
            build_profile(job, name, blobs, language, ref_text, calibrate == "1")

    threading.Thread(target=runner, daemon=True, name=f"build-{job['id']}").start()
    return {"job": job["id"]}


@app.get("/jobs/{jid}")
async def job(jid: str):
    j = JOBS.get(jid)
    return j if j else _err("no such job", 404)


@app.get("/profiles/{pid}")
async def get_profile(pid: str):
    p = load_profile(pid)
    return p if p else _err("not found", 404)


@app.post("/profiles/{pid}/text")
async def set_text(pid: str, body: dict):
    p = load_profile(pid)
    if not p:
        return _err("not found", 404)
    txt = str(body.get("ref_text", "")).strip()
    if not txt:
        return _err("ref_text empty")
    p["ref_text"] = txt
    if "candidates" in p:
        p["candidates"][p.get("anchor_candidate", 0)]["text"] = txt
    write_json_atomic(profile_dir(pid) / "profile.json", p)
    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(None, load_on_workers, pid)
    return {"ok": True, "workers": res}


@app.post("/profiles/{pid}/candidate")
async def set_candidate(pid: str, body: dict):
    p = load_profile(pid)
    if not p:
        return _err("not found", 404)
    k = int(body.get("index", 0))
    if not 0 <= k < len(p.get("candidates", [])):
        return _err("bad index")
    c = p["candidates"][k]
    name = f"anchor_{k}.wav"
    shutil.copy(profile_dir(pid) / c["file"], profile_dir(pid) / name)
    p.update({"anchor": name, "anchor_candidate": k, "ref_text": c["text"]})
    write_json_atomic(profile_dir(pid) / "profile.json", p)
    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(None, load_on_workers, pid)
    return {"ok": True, "workers": res}


@app.post("/profiles/{pid}/calibrate")
async def calibrate(pid: str):
    if not load_profile(pid):
        return _err("not found", 404)
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, calibrate_profile, pid, None)
    except Exception as e:  # noqa: BLE001
        return _err(f"{type(e).__name__}: {e}", 500)


@app.delete("/profiles/{pid}")
async def delete_profile(pid: str):
    shutil.rmtree(profile_dir(pid), ignore_errors=True)
    a = read_json(STATE / "active.json", {})
    if a.get("id") == pid:
        try:
            (STATE / "active.json").unlink()
        except OSError:
            pass
    return {"ok": True}


@app.post("/evaluate")
async def evaluate(profile: str = Form(...), text: str = Form(""), file: UploadFile = File(...)):
    data = await file.read()
    loop = asyncio.get_running_loop()

    def work():
        y = decode_audio(data, file.filename or "gen")
        return evaluate_audio(y, profile, text or None)

    try:
        return await loop.run_in_executor(None, work)
    except Exception as e:  # noqa: BLE001
        log.exception("evaluate failed")
        return _err(f"{type(e).__name__}: {e}", 500)


DEFAULT_CONS_TEXTS = ["你好，很高兴认识你，今天我想和你聊一聊最近发生的一些有趣的事情。",
                      "其实呢，说话的节奏和呼吸是分不开的，对不对？",
                      "Honestly, I think the best part of the day is the quiet hour before everyone wakes up."]


def consistency(pid: str, texts: list[str]) -> dict:
    ref = load_ref_stats(pid)
    per = [{"gpu": i, "items": []} for i in range(len(WORKERS))]
    outs: dict[tuple[int, int], np.ndarray] = {}
    for ti, txt in enumerate(texts):
        for gi in range(len(WORKERS)):
            try:
                y, st = synth_full(gi, pid, txt, seed=100 + 17 * ti + gi)
                outs[(gi, ti)] = y
                m = evaluate_audio(y, pid, txt, ref)
                m["rtf_x"] = st.get("rtf_x")
                m["first_chunk_ms"] = st.get("first_chunk_ms")
                m["gain_db"] = st.get("gain_db")
                per[gi]["items"].append(m)
            except Exception as e:  # noqa: BLE001
                per[gi]["items"].append({"error": f"{type(e).__name__}: {e}"})
    def mean(gi, key):
        v = [it.get(key) for it in per[gi]["items"] if isinstance(it.get(key), (int, float))]
        return float(np.mean(v)) if v else None
    for gi in range(len(WORKERS)):
        per[gi]["mean"] = {k: (round(mean(gi, k), 3) if mean(gi, k) is not None else None)
                           for k in ("speaker_sim_centroid", "speaker_sim_anchor", "cer", "fidelity_index", "rtf_x",
                                     "first_chunk_ms", "f0_median_diff_cents", "rate_ratio", "spectral_dist_db")}
        per[gi]["mean"]["speech_db"] = round(float(np.mean([it["energy_gen"]["speech_db"] for it in per[gi]["items"]
                                                            if "energy_gen" in it] or [0])), 2)
    cross = []
    if len(WORKERS) >= 2:
        for ti in range(len(texts)):
            if (0, ti) in outs and (1, ti) in outs:
                cross.append(SPK.sim(SPK.embed(to16k(outs[(0, ti)])), SPK.embed(to16k(outs[(1, ti)]))))
    res = {"profile": pid, "gpus": per, "cross_gpu_speaker_sim": round(float(np.mean(cross)), 4) if cross else None,
           "speaker_model": SPK.method}
    if len(per) >= 2:
        d_loud = abs(per[0]["mean"]["speech_db"] - per[1]["mean"]["speech_db"])
        a, b = per[0]["mean"].get("speaker_sim_centroid"), per[1]["mean"].get("speaker_sim_centroid")
        d_sim = abs(a - b) if a is not None and b is not None else None
        res["delta"] = {"loudness_db": round(d_loud, 2), "speaker_sim": round(d_sim, 4) if d_sim is not None else None}
        res["consistent"] = bool(d_loud < 1.5 and (d_sim is None or d_sim < 0.04)
                                 and (res["cross_gpu_speaker_sim"] is None or res["cross_gpu_speaker_sim"] > 0.80))
    return res


@app.post("/consistency")
async def consistency_ep(body: dict):
    pid = body.get("profile") or (read_json(STATE / "active.json", {}) or {}).get("id")
    if not pid or not load_profile(pid):
        return _err("profile not found")
    texts = body.get("texts") or DEFAULT_CONS_TEXTS
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, consistency, pid, texts)
    except Exception as e:  # noqa: BLE001
        log.exception("consistency failed")
        return _err(f"{type(e).__name__}: {e}", 500)


if __name__ == "__main__":
    import uvicorn
    log.info("analyst on :%d mock=%s", ANALYST_PORT, MOCK)
    uvicorn.run(app, host="127.0.0.1", port=ANALYST_PORT, log_level="warning", access_log=False)
