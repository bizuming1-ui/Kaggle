#!/usr/bin/env python3
"""Kaggle-path gate for py/deps.py + py/bootstrap.py.

WHY THIS EXISTS
---------------
The sandbox battery runs bootstrap in a mock mode that never calls
deps.build_constraints() — so when the TRANSFORMERS_PIN / ACCELERATE_PIN
constants were lost in a rewrite, every local check stayed green while
Kaggle died at bootstrap step 2 with
    NameError: name 'TRANSFORMERS_PIN' is not defined
This check exercises the Kaggle-only paths directly, with no GPU and no
network:

  1. deps.build_constraints() runs and pins the tested TTS combo
     (transformers / accelerate exact versions, torch never floated).
  2. install_core's faster-qwen3-tts spec is the pinned release and its
     retry references the SAME pin constants (no second hard-coded
     version that could fight the constraints file).
  3. pyflakes reports NO "undefined name" anywhere in py/ — the class of
     bug that hid both TRANSFORMERS_PIN and bootstrap's seen_tb.

Run:  python3 tools/deps_check.py        (exit 0 = PASS)
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "py"))

FAILURES: list[str] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    print(("  ✓ " if ok else "  ✗ ") + label + (f"  {detail}" if detail else ""))
    if not ok:
        FAILURES.append(label)


def main() -> int:
    import deps  # noqa: PLC0415  (path set above)

    print("[deps_check] Kaggle-only dependency paths")

    # 1) build_constraints on a Kaggle-like probe (the crash site)
    p = deps.Probe()
    p.torch, p.torchaudio = "2.10.0+cu128", "2.10.0+cu128"
    p.numpy, p.scipy = "2.0.2", "1.16.3"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "constraints.txt"
        lines = deps.build_constraints(p, out)
        written = out.read_text(encoding="utf-8").strip().splitlines()
    check(lines == written, "constraints file written verbatim")
    check("torch==2.10.0" in lines, "torch frozen to the installed build (never replaced)")
    check(f"transformers=={deps.TRANSFORMERS_PIN}" in lines,
          f"transformers pinned ({deps.TRANSFORMERS_PIN})")
    check(f"accelerate=={deps.ACCELERATE_PIN}" in lines,
          f"accelerate pinned ({deps.ACCELERATE_PIN})")
    check(deps.TRANSFORMERS_PIN == "5.18.0" and deps.ACCELERATE_PIN == "1.12.0"
          and deps.FASTER_QWEN_PIN == "0.5.4",
          "pins match the upstream-tested combo (5.18.0 / 1.12.0 / 0.5.4)")

    # 2) install_core references the pins, no stray hard-coded versions
    src = (ROOT / "py" / "deps.py").read_text(encoding="utf-8")
    check(f"faster-qwen3-tts=={{FASTER_QWEN_PIN}}" in src.replace("'", '"')
          or "FASTER_QWEN_PIN" in src,
          "faster-qwen3-tts install is pinned")
    bad = [v for v in ("5.15.1", "5.20", "transformers==5") if f"transformers=={v}" in src]
    check(not bad, "no second hard-coded transformers version", str(bad))

    # 3) no undefined names anywhere in py/ (needs pyflakes; pip-installable)
    try:
        import pyflakes  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pyflakes"],
                       check=False, capture_output=True)
    r = subprocess.run([sys.executable, "-m", "pyflakes", *sorted(str(p) for p in (ROOT / "py").glob("*.py"))],
                       capture_output=True, text=True)
    undef = [ln for ln in r.stdout.splitlines() if "undefined name" in ln]
    check(not undef, "pyflakes: no undefined names in py/", "; ".join(undef[:5]))

    print(f"\nDEPS: {'PASS' if not FAILURES else 'FAIL: ' + ', '.join(FAILURES)}")
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
