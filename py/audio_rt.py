"""ctypes bridge to the Rust runtime (libaudio_rt.so) with a pure-numpy fallback.

Both back-ends expose the same API so the worker never cares which one is active.
The fallback is always safe; what matters is that a broken .so never takes the
worker down, and that the reason for the fallback is recorded, not swallowed.
"""
from __future__ import annotations

import ctypes
import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger("qtts.audio_rt")

_HERE = Path(__file__).resolve().parent

# every symbol the bridge needs - a .so missing one of them is unusable
_REQUIRED = (
    "rt_version", "rt_leveler_new", "rt_leveler_free", "rt_leveler_start_segment",
    "rt_leveler_process", "rt_leveler_flush", "rt_leveler_gain_db", "rt_leveler_env_dbfs",
    "rt_breath_synth", "rt_rms_dbfs", "rt_peak",
)


def _candidates():
    env = os.environ.get("QTTS_RT_LIB")
    if env:
        yield Path(env)
    yield _HERE.parent / "rust" / "audio_rt" / "target" / "release" / "libaudio_rt.so"
    yield _HERE / "libaudio_rt.so"


def _load():
    """Return (lib, reason).  reason is None when the Rust runtime is active."""
    if os.environ.get("QTTS_NO_RUST") == "1":
        return None, "disabled by QTTS_NO_RUST=1"
    seen: list[str] = []
    for p in _candidates():
        if not p.exists():
            continue
        try:
            lib = ctypes.CDLL(str(p))
            missing = [s for s in _REQUIRED if not hasattr(lib, s)]
            if missing:
                seen.append(f"{p.name}: missing {','.join(missing)}")
                continue
            lib.rt_version.restype = ctypes.c_uint32
            ver = int(lib.rt_version())
            if ver < 3:
                seen.append(f"{p.name}: ABI v{ver} < 3")
                continue
            lib.rt_leveler_new.restype = ctypes.c_void_p
            lib.rt_leveler_new.argtypes = [ctypes.c_uint32, ctypes.c_float, ctypes.c_float, ctypes.c_float]
            lib.rt_leveler_free.argtypes = [ctypes.c_void_p]
            lib.rt_leveler_start_segment.argtypes = [ctypes.c_void_p]
            lib.rt_leveler_process.restype = ctypes.c_int32
            lib.rt_leveler_process.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p]
            lib.rt_leveler_flush.restype = ctypes.c_int32
            lib.rt_leveler_flush.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]
            lib.rt_leveler_gain_db.restype = ctypes.c_float
            lib.rt_leveler_gain_db.argtypes = [ctypes.c_void_p]
            lib.rt_leveler_env_dbfs.restype = ctypes.c_float
            lib.rt_leveler_env_dbfs.argtypes = [ctypes.c_void_p]
            lib.rt_breath_synth.restype = ctypes.c_int32
            lib.rt_breath_synth.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint32,
                                            ctypes.c_uint64, ctypes.c_float]
            lib.rt_rms_dbfs.restype = ctypes.c_float
            lib.rt_rms_dbfs.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
            lib.rt_peak.restype = ctypes.c_float
            lib.rt_peak.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
            return lib, None
        except Exception as e:  # noqa: BLE001 - any loader failure must fall back, never crash
            seen.append(f"{p.name}: {type(e).__name__}: {e}")
    reason = "; ".join(seen) if seen else "libaudio_rt.so not found"
    return None, reason


_LIB, _FALLBACK_REASON = _load()
BACKEND = "rust" if _LIB is not None else "numpy"
if _LIB is None:
    log.warning("Rust audio runtime unavailable (%s) - using the numpy fallback", _FALLBACK_REASON)


def self_check() -> dict:
    """Verify the active back-end actually processes audio.

    Called by the bootstrap: a runtime that loads but produces garbage is worse
    than no runtime at all, because the failure would only show up as noise in
    the output stream.
    """
    t = np.linspace(0, 1.0, 24000, dtype=np.float32)
    x = (0.25 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    out = Leveler(24000, -21.0).process(x)
    info = {
        "backend": BACKEND,
        "reason": _FALLBACK_REASON,
        "in_rms_dbfs": round(rms_dbfs(x), 2),
        "out_rms_dbfs": round(rms_dbfs(out.astype(np.float32) / 32768.0), 2),
        "peak": round(peak(out.astype(np.float32) / 32768.0), 4),
        "finite": bool(np.isfinite(out).all()),
    }
    info["ok"] = bool(info["finite"] and out.size == x.size and info["out_rms_dbfs"] > -50)
    return info


def _f32(x) -> np.ndarray:
    return np.ascontiguousarray(np.asarray(x, dtype=np.float32).reshape(-1))


def rms_dbfs(x) -> float:
    a = _f32(x)
    if a.size == 0:
        return -90.0
    if _LIB is not None:
        return float(_LIB.rt_rms_dbfs(a.ctypes.data, a.size))
    return float(20 * np.log10(max(float(np.sqrt(np.mean(a.astype(np.float64) ** 2))), 1e-9)))


def peak(x) -> float:
    a = _f32(x)
    if a.size == 0:
        return 0.0
    if _LIB is not None:
        return float(_LIB.rt_peak(a.ctypes.data, a.size))
    return float(np.max(np.abs(a)))


def breath(n: int, sr: int, seed: int, level_dbfs: float) -> np.ndarray:
    """Synthetic inhale noise (float32). Used when no recorded breath exists."""
    n = int(max(n, 1))
    out = np.zeros(n, dtype=np.float32)
    if _LIB is not None:
        _LIB.rt_breath_synth(out.ctypes.data, n, int(sr), int(seed) & 0xFFFFFFFFFFFFFFFF, float(level_dbfs))
        return out
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n).astype(np.float32)
    # crude band shaping: difference (high-pass) then moving average (low-pass)
    x = np.diff(x, prepend=0.0)
    k = max(2, int(sr / 4000))
    x = np.convolve(x, np.ones(k, dtype=np.float32) / k, mode="same")
    t = np.arange(n, dtype=np.float32)
    rise = max(1.0, n * 0.42)
    env = np.where(t < rise, 0.5 - 0.5 * np.cos(np.pi * t / rise), np.clip(1 - (t - rise) / max(n - rise, 1), 0, 1) ** 1.6)
    s = x * env.astype(np.float32)
    rms = float(np.sqrt(np.mean(s * s))) or 1e-9
    g = (10 ** (np.clip(level_dbfs, -60, -18) / 20)) / (rms * 1.7)
    return np.clip(s * g, -0.98, 0.98).astype(np.float32)


class Leveler:
    """Stateful per-voice loudness leveler / DC blocker / soft limiter -> int16."""

    def __init__(self, sr: int, target_dbfs: float = -21.0, max_gain_db: float = 9.0, min_gain_db: float = -9.0):
        self.sr = int(sr)
        self.target_dbfs = float(target_dbfs)
        self._h = None
        if _LIB is not None:
            self._h = _LIB.rt_leveler_new(self.sr, float(target_dbfs), float(max_gain_db), float(min_gain_db))
        # numpy fallback state
        self._env = 10 ** (target_dbfs / 20)
        self._gain = 1.0
        self._max = 10 ** (max_gain_db / 20)
        self._min = 10 ** (min_gain_db / 20)
        self._seen = 0
        self._last = 0.0
        self._fade = 0
        self._prev_x = 0.0
        self._prev_y = 0.0

    def close(self):
        if self._h is not None and _LIB is not None:
            _LIB.rt_leveler_free(self._h)
            self._h = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def start_segment(self):
        if self._h is not None:
            _LIB.rt_leveler_start_segment(self._h)
        else:
            self._fade = max(8, int(self.sr * 0.004))

    def process(self, x) -> np.ndarray:
        a = _f32(x)
        out = np.empty(a.size, dtype=np.int16)
        if a.size == 0:
            return out
        if self._h is not None:
            _LIB.rt_leveler_process(self._h, a.ctypes.data, a.size, out.ctypes.data)
            return out
        a = np.nan_to_num(a, nan=0.0, posinf=0.0, neginf=0.0)
        # DC removal: subtract a 20 ms moving mean (cheap vectorised high-pass)
        y = a - (a.mean() if a.size < 64 else np.convolve(a, np.ones(480) / 480, mode="same"))
        blk = max(32, int(self.sr * 0.01))
        nb = y.size // blk
        n = y.size
        tgt = 10 ** (self.target_dbfs / 20)
        if nb >= 1:
            rb = np.sqrt(np.mean(y[: nb * blk].reshape(nb, blk) ** 2, axis=1))
            gains = np.empty(nb, dtype=np.float32)
            g = self._gain
            for i in range(nb):  # same per-10ms speech-gated envelope + fast-down/slow-up smoothing as the Rust runtime
                r = float(rb[i])
                if r > 0.005:  # > -46 dBFS
                    al = 0.08 if self._seen < 60 else 0.012
                    self._env += (r - self._env) * al
                    self._seen += 1
                    self._want = float(np.clip(tgt / max(self._env, 1e-4), self._min, self._max))
                want = getattr(self, "_want", 1.0)
                g += (want - g) * (0.28 if want < g else 0.0166)
                gains[i] = g
            self._gain = g
            gs = np.interp(np.arange(n), (np.arange(nb) + 0.5) * blk, gains).astype(np.float32)
        else:
            gs = np.full(n, self._gain, dtype=np.float32)
        v = y * gs
        if self._fade > 0:
            m = min(self._fade, v.size)
            v[:m] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(m) / max(self._fade, 1))).astype(np.float32)
            self._fade -= m
        aa = np.abs(v)
        over = aa > 0.89
        if over.any():
            v = np.where(over, np.sign(v) * (0.89 + 0.1 * np.tanh((aa - 0.89) / 0.1)), v)
        self._last = float(v[-1])
        out[:] = np.clip(np.round(v * 32767.0), -32768, 32767).astype(np.int16)
        return out

    def flush(self, n: int = 192) -> np.ndarray:
        out = np.zeros(int(n), dtype=np.int16)
        if self._h is not None:
            _LIB.rt_leveler_flush(self._h, out.ctypes.data, out.size)
            return out
        p = np.arange(1, n + 1, dtype=np.float32) / n
        out[:] = np.round(self._last * (0.5 + 0.5 * np.cos(np.pi * p)) * 32767).astype(np.int16)
        self._last = 0.0
        return out

    @property
    def gain_db(self) -> float:
        if self._h is not None:
            return float(_LIB.rt_leveler_gain_db(self._h))
        return float(20 * np.log10(max(self._gain, 1e-6)))

    @property
    def env_dbfs(self) -> float:
        if self._h is not None:
            return float(_LIB.rt_leveler_env_dbfs(self._h))
        return float(20 * np.log10(max(self._env, 1e-6)))


def f32_to_i16(x) -> np.ndarray:
    a = np.clip(_f32(x), -1.0, 1.0)
    return np.round(a * 32767.0).astype(np.int16)
