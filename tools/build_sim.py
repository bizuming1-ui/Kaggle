#!/usr/bin/env python3
"""Generate `web/sim.html` — the browser simulator page.

The simulator must display *exactly* what the Kaggle deployment serves, so it
is generated as a byte-identical copy of `web/index.html`.  The only difference
is the URL: app.js detects `sim.html` (or `?sim=1`) and swaps the network layer
for `web/sim-data.js`, which answers every request with deployment-state data.

    python tools/build_sim.py            # regenerate web/sim.html
    python tools/build_sim.py --check    # verify web/sim.html == web/index.html
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "index.html"
OUT = ROOT / "web" / "sim.html"


def build() -> bytes:
    return SRC.read_bytes()


def main() -> int:
    check = "--check" in sys.argv
    want = build()
    if check:
        have = OUT.read_bytes() if OUT.exists() else b""
        if have != want:
            print(f"✗ web/sim.html is out of date ({len(have)} B vs {len(want)} B) — run: python tools/build_sim.py")
            return 1
        print(f"✓ web/sim.html matches web/index.html ({len(want)} B) — simulator shows the same content as the Kaggle site")
        return 0
    OUT.write_bytes(want)
    print(f"✓ wrote web/sim.html ({len(want)} B) — byte-identical to web/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
