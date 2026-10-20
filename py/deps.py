#!/usr/bin/env python3
"""Dependency strategy for Kaggle that never breaks the pre-installed CUDA stack.

Why this module exists
----------------------
`faster-qwen3-tts` pulls in `qwen-tts-hf`, which requires `torchaudio`.
`torchaudio` hard-pins `torch` (torchaudio 2.6.0 requires torch==2.6.0).
If the notebook's pre-installed torch does not match the newest torchaudio on
PyPI, pip *replaces* torch with a build linked against a newer CUDA runtime -
and on a Kaggle driver that only supports CUDA 12.4 the replacement fails with
"CUDA driver is too old".  `torch.cuda.is_available()` then returns False and
the whole system dies with a cryptic error.

The same trap exists for `speechbrain` (requires torch>=2.7.1) and for
`librosa>=1.0` (requires numpy>=2.1 -> numba ABI churn).

The rules implemented here:
  1. Never let pip move the pre-installed torch / torchaudio / numpy / scipy.
     A pip *constraints* file pins them to the exact installed versions.
  2. If torchaudio is missing, install the build that matches the installed
     torch (same release) - never "the latest".
  3. Optional heavy packages (speechbrain) are installed with --no-deps and
     only their light dependencies, so they cannot drag torch along.
  4. After every install the CUDA capability is re-verified; a regression is
     reported loudly instead of failing later inside the GPU worker.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# The last torch release known to work with the CUDA 12.4 driver family
# (Kaggle's standard T4x2 image).  Used only when torch must be upgraded.
FALLBACK_TORCH = "2.6.0"

# The TTS stack combo the upstream authors actually tested (faster-qwen3-tts
# 0.5.4 wheel metadata + PyPI, read 2026-10).  An unpinned install floats
# transformers to the newest 5.x, whose MimiConfig no longer exposes
# rope_theta and crashes qwen-tts-hf at load (see py/compat.py).  These
# constants are referenced by build_constraints() and install_core(); they
# were once lost in a rewrite, which made bootstrap step 2 die with
# "NameError: name 'TRANSFORMERS_PIN' is not defined" on Kaggle.
TRANSFORMERS_PIN = "5.18.0"
ACCELERATE_PIN = "1.12.0"
FASTER_QWEN_PIN = "0.5.4"

# driver CUDA version -> PyTorch wheel index
CUDA_INDEX = {
    "11.8": "https://download.pytorch.org/whl/cu118",
    "12.1": "https://download.pytorch.org/whl/cu121",
    "12.4": "https://download.pytorch.org/whl/cu124",
    "12.6": "https://download.pytorch.org/whl/cu126",
    "12.8": "https://download.pytorch.org/whl/cu128",
    "12.9": "https://download.pytorch.org/whl/cu129",
    "13.0": "https://download.pytorch.org/whl/cu130",
}


@dataclass
class Probe:
    python: str = sys.executable
    torch: str | None = None
    torch_cuda: str | None = None
    torchaudio: str | None = None
    numpy: str | None = None
    scipy: str | None = None
    cuda_available: bool = False
    device_count: int = 0
    devices: list[str] = field(default_factory=list)
    driver_cuda: str | None = None
    gpu_names: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "python": self.python,
            "torch": self.torch,
            "torch_cuda": self.torch_cuda,
            "torchaudio": self.torchaudio,
            "numpy": self.numpy,
            "scipy": self.scipy,
            "cuda_available": self.cuda_available,
            "device_count": self.device_count,
            "devices": self.devices,
            "driver_cuda": self.driver_cuda,
            "gpu_names": self.gpu_names,
        }


def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def _py_version(mod: str) -> str | None:
    rc, out = _run([sys.executable, "-c",
                    f"import importlib.metadata as m;print(m.version({mod!r}))"], timeout=60)
    return out.strip().splitlines()[-1] if rc == 0 and out.strip() else None


def _base_version(v: str | None) -> str | None:
    """'2.6.0+cu124' -> '2.6.0'"""
    if not v:
        return None
    return v.split("+")[0].strip()


def driver_cuda_version() -> str | None:
    rc, out = _run(["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"], timeout=20)
    if rc != 0:
        return None
    # map driver -> max supported CUDA
    table = {"550": "12.4", "535": "12.2", "525": "12.0", "570": "12.8", "580": "13.0"}
    for line in out.splitlines():
        m = re.match(r"(\d+)\.", line.strip())
        if m:
            major = m.group(1)
            if major in table:
                return table[major]
            try:
                if int(major) >= 570:
                    return "12.8"
                if int(major) >= 550:
                    return "12.4"
            except ValueError:
                pass
    rc2, out2 = _run(["nvidia-smi"], timeout=20)
    m = re.search(r"CUDA Version:\s*([0-9.]+)", out2)
    return m.group(1) if m else None


def probe() -> Probe:
    p = Probe()
    p.torch = _py_version("torch")
    p.torchaudio = _py_version("torchaudio")
    p.numpy = _py_version("numpy")
    p.scipy = _py_version("scipy")
    p.driver_cuda = driver_cuda_version()
    code = (
        "import torch,json;"
        "d={'ok':bool(torch.cuda.is_available()),'n':0,'names':[],'cv':None};"
        "\ntry:\n"
        " d['ok']=bool(torch.cuda.is_available())\n"
        " d['n']=torch.cuda.device_count() if d['ok'] else 0\n"
        " d['names']=[torch.cuda.get_device_name(i) for i in range(d['n'])]\n"
        " d['cv']=torch.version.cuda\n"
        "except Exception as e:\n"
        " d['err']=str(e)[:200]\n"
        "print(json.dumps(d))"
    )
    rc, out = _run([sys.executable, "-c", code], timeout=120)
    if rc == 0:
        for line in reversed(out.strip().splitlines()):
            try:
                d = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            p.cuda_available = bool(d.get("ok"))
            p.device_count = int(d.get("n") or 0)
            p.gpu_names = list(d.get("names") or [])
            p.torch_cuda = d.get("cv")
            break
    return p


def pip_index_url() -> str:
    """PyTorch wheel index matching the driver (empty = plain PyPI)."""
    cu = driver_cuda_version()
    if cu and cu in CUDA_INDEX:
        return CUDA_INDEX[cu]
    return ""


# ---------------------------------------------------------------------------
# constraints
# ---------------------------------------------------------------------------
def build_constraints(p: Probe, path: Path) -> list[str]:
    """Write a pip constraints file that freezes the pre-installed stack."""
    lines: list[str] = []
    tv = _base_version(p.torch)
    if tv:
        lines.append(f"torch=={tv}")
    ta = _base_version(p.torchaudio)
    if ta:
        lines.append(f"torchaudio=={ta}")
    if p.numpy:
        lines.append(f"numpy=={p.numpy}")
    if p.scipy:
        lines.append(f"scipy=={p.scipy}")
    # librosa >= 1.0 demands numpy >= 2.1 and numba >= 0.61; 0.11.x works with
    # every numpy from 1.22 up and keeps the ABI stable.
    lines.append("librosa>=0.10.2,<1.0")
    lines.append("numba>=0.57")
    # Freeze the TTS stack combo (see TRANSFORMERS_PIN above): an unpinned
    # `pip install faster-qwen3-tts` otherwise upgrades transformers to the
    # newest 5.x, which the upstream combo was never tested against.
    lines.append(f"transformers=={TRANSFORMERS_PIN}")
    lines.append(f"accelerate=={ACCELERATE_PIN}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return lines


def pip_cmd(*extra: str) -> list[str]:
    return [sys.executable, "-m", "pip", "install", "--no-input", "--disable-pip-version-check",
            "--no-warn-script-location", *extra]


def run_pip(args: list[str], timeout: int = 1800, echo: bool = True) -> tuple[int, str]:
    """Run pip, keep the tail of the output, never hide the error."""
    cmd = pip_cmd(*args)
    print("   $ " + " ".join(cmd[:6]) + (" ..." if len(cmd) > 6 else ""), flush=True)
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, bufsize=1)
    except OSError as e:
        return 1, str(e)
    tail: list[str] = []
    assert p.stdout
    for line in p.stdout:
        tail.append(line)
        if len(tail) > 60:
            tail.pop(0)
        if echo and (line.startswith("  ") or "error" in line.lower() or "Successfully" in line
                     or "Requirement already satisfied: torch" in line):
            print("   " + line.rstrip()[:200], flush=True)
    try:
        rc = p.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        p.kill()
        return 1, "pip timed out"
    return rc, "".join(tail)


# ---------------------------------------------------------------------------
# install plan
# ---------------------------------------------------------------------------
def install_core(constraints: Path, log) -> dict:
    """Install the TTS stack without ever moving torch."""
    res: dict = {"steps": []}
    c = ["-c", str(constraints)]

    # 1) torchaudio must match the installed torch (it pins torch exactly)
    p = probe()
    tv = _base_version(p.torch)
    if tv and not p.torchaudio:
        log(f"   torchaudio missing -> installing the build that matches torch {tv}")
        idx = pip_index_url()
        args = c + [f"torchaudio=={tv}"]
        if idx:
            args += ["--index-url", idx, "--extra-index-url", "https://pypi.org/simple"]
        rc, out = run_pip(args)
        res["steps"].append(("torchaudio", rc))
        if rc != 0:
            log("   ⚠ torchaudio install failed; trying plain PyPI")
            rc, out = run_pip(c + [f"torchaudio=={tv}"])
            res["steps"].append(("torchaudio-pypi", rc))
    p2 = probe()
    if p2.torch != p.torch:
        log(f"   ✗ torch changed during install: {p.torch} -> {p2.torch}")

    # 2) librosa is a HARD import of qwen_tts (core/models + inference), and
    #    librosa 1.0 forces numba/numpy churn -> keep it on the 0.10/0.11 line.
    if not _py_version("librosa"):
        log("   librosa missing -> installing the 0.10/0.11 line")
        run_pip(c + ["librosa>=0.10.2,<1.0"])

    # 3) the TTS engine itself (pinned: a floating install can pull a
    #    release whose metadata fights the constraints above)
    rc, out = run_pip(c + [f"faster-qwen3-tts=={FASTER_QWEN_PIN}"])
    res["steps"].append(("faster-qwen3-tts", rc))
    res["tts_log"] = out[-3000:] if rc != 0 else ""
    if rc != 0:
        # retry with the tested transformers pin spelled out (must match
        # the constraint, never a second hard-coded version)
        log("   ⚠ faster-qwen3-tts failed; retrying with an explicit transformers pin")
        rc2, out2 = run_pip(c + [f"transformers=={TRANSFORMERS_PIN}",
                                 f"faster-qwen3-tts=={FASTER_QWEN_PIN}"])
        res["steps"].append(("faster-qwen3-tts-pinned", rc2))
        res["tts_log"] = out2[-3000:] if rc2 != 0 else res["tts_log"]
        rc = rc2
    res["tts_ok"] = rc == 0
    return res


def install_optional(constraints: Path, log) -> dict:
    """Install the optional analysis packages; they must not touch torch."""
    c = ["-c", str(constraints)]
    out: dict = {}

    # faster-whisper: ctranslate2 based, no torch dependency at all
    rc, _ = run_pip(c + ["faster-whisper"], echo=False)
    out["faster_whisper"] = rc == 0

    # speechbrain: --no-deps so that its "torch>=2.7.1" cannot replace torch
    if not _py_version("speechbrain"):
        light = ["joblib", "hyperpyyaml", "ruamel.yaml", "sentencepiece", "typing_extensions"]
        run_pip(c + light, echo=False)
        rc2, _ = run_pip(["--no-deps", "speechbrain"], echo=False)
        ok = rc2 == 0
        if ok:
            rc3, _ = _run([sys.executable, "-c",
                           "from speechbrain.inference.speaker import EncoderClassifier;print('ok')"],
                          timeout=180)
            ok = rc3 == 0
        out["speechbrain"] = ok
        if not ok:
            log("   ⚠ speechbrain unavailable (ECAPA speaker scoring falls back to MFCC)")
    else:
        out["speechbrain"] = True

    # DSP helpers used by the analyst
    rc, _ = run_pip(c + ["scipy", "soundfile", "numba"], echo=False)
    out["dsp"] = rc == 0

    # noisereduce pulls `samplerate` (a C extension); it is a nice-to-have
    # because the analyst degrades to "kept raw" when it is unavailable.
    rc, _ = run_pip(c + ["noisereduce"], echo=False)
    out["noisereduce"] = rc == 0
    if rc != 0:
        log("   ⚠ noisereduce unavailable (the analyst keeps the raw signal)")
    return out


def install_web(constraints: Path) -> dict:
    c = ["-c", str(constraints)]
    rc, _ = run_pip(c + ["fastapi", "uvicorn", "python-multipart", "requests", "kaggle",
                         "huggingface_hub", "soundfile"], echo=False)
    return {"web": rc == 0}


def verify_cuda() -> tuple[bool, Probe]:
    p = probe()
    return p.cuda_available, p


if __name__ == "__main__":
    pr = probe()
    print(json.dumps(pr.as_dict(), indent=2, ensure_ascii=False))
