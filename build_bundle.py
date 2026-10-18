#!/usr/bin/env python3
"""Build the single-file Kaggle bundle (`yuyinkelong`) from the source tree.

The repo keeps real, reviewable sources (py/, go/, rust/, tools/, web/) and ships
one self-contained script that a user can paste into a Kaggle notebook cell:

    python build_bundle.py            # regenerate ./yuyinkelong
    python build_bundle.py --check    # verify ./yuyinkelong matches the tree

The bundle embeds every source file as base64(zlib(raw)) next to a truncated
SHA-256 digest.  On execution it re-hashes every payload and refuses to run if
anything was truncated or corrupted by a copy/paste, then unpacks the tree into
/kaggle/working/qtts and starts py/bootstrap.py.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import re
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "yuyinkelong"
# Byte copy of the bundle served next to the web console (web/ is the only dir
# the gateway FileServer exposes).  The browser simulator's copy button fetches
# this file so "copy → paste into Kaggle" works with the REAL runnable bundle,
# even when github.com is unreachable.  Deliberately NOT listed in FILES below:
# the bundle must never contain a copy of itself.
SIM_COPY = ROOT / "web" / "sim-bundle.txt"

# (path in bundle, source path, mode) - order matters only for readability.
FILES: list[tuple[str, str, str]] = [
    ("README.md", "README.md", "r"),
    ("MEMO.md", "MEMO.md", "r"),
    ("build_bundle.py", "build_bundle.py", "r"),
    ("go/gateway/go.mod", "go/gateway/go.mod", "r"),
    ("go/gateway/llm.go", "go/gateway/llm.go", "r"),
    ("go/gateway/main.go", "go/gateway/main.go", "r"),
    ("go/gateway/scheduler.go", "go/gateway/scheduler.go", "r"),
    ("go/gateway/segmenter.go", "go/gateway/segmenter.go", "r"),
    ("go/gateway/segmenter_test.go", "go/gateway/segmenter_test.go", "r"),
    ("go/gateway/session.go", "go/gateway/session.go", "r"),
    ("go/gateway/chat.go", "go/gateway/chat.go", "r"),
    ("go/gateway/gateway_test.go", "go/gateway/gateway_test.go", "r"),
    ("py/analyst.py", "py/analyst.py", "r"),
    ("py/audio_rt.py", "py/audio_rt.py", "r"),
    ("py/bootstrap.py", "py/bootstrap.py", "r"),
    ("py/chat.py", "py/chat.py", "r"),
    ("py/compat.py", "py/compat.py", "r"),
    ("py/deps.py", "py/deps.py", "r"),
    ("py/persist.py", "py/persist.py", "r"),
    ("py/qtts_common.py", "py/qtts_common.py", "r"),
    ("py/supervisor.py", "py/supervisor.py", "r"),
    ("py/worker.py", "py/worker.py", "r"),
    ("rust/audio_rt/Cargo.toml", "rust/audio_rt/Cargo.toml", "r"),
    ("rust/audio_rt/src/lib.rs", "rust/audio_rt/src/lib.rs", "r"),
    ("tools/chat_check.py", "tools/chat_check.py", "r"),
    ("tools/e2e_check.py", "tools/e2e_check.py", "r"),
    ("tools/rope_compat_check.py", "tools/rope_compat_check.py", "r"),
    ("tools/selftest.py", "tools/selftest.py", "r"),
    ("tools/watermark_check.py", "tools/watermark_check.py", "r"),
    ("tools/web_smoke.mjs", "tools/web_smoke.mjs", "r"),
    ("tools/build_sim.py", "tools/build_sim.py", "r"),
    ("web/index.html", "web/index.html", "r"),
    ("web/sim.html", "web/sim.html", "r"),
    ("web/styles.css", "web/styles.css", "r"),
    ("web/app.js", "web/app.js", "r"),
    ("web/player.js", "web/player.js", "r"),
    ("web/chat.js", "web/chat.js", "r"),
    ("web/simulator.js", "web/simulator.js", "r"),
    ("web/sim-data.js", "web/sim-data.js", "r"),
]

HEADER = '''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# QTTS - Qwen3-TTS 1.7B voice cloning on Kaggle (2x T4) - ONE-CELL DEPLOY.
#
# HOW TO USE (Kaggle notebook, Accelerator: GPU T4 x2, Internet: On)
#
#   1. Copy EVERYTHING between the markers below into one notebook cell.
#   2. Run it.  The script writes the project to /kaggle/working/qtts,
#      installs the dependencies, builds the Go gateway + Rust runtime,
#      starts 2 GPU workers and prints a public URL.
#
#   Optional Kaggle Secrets: DEEPSEEK_API_KEY (text LLM), HF_TOKEN (model hub),
#   KAGGLE_USERNAME / KAGGLE_KEY (voice-profile persistence).
#
#   >>> Do not edit anything between the markers. <<<
#
# (Header is pure comments on purpose: no string literal that a truncated
#  paste could leave unterminated — pasting any prefix of this file either
#  runs or fails where the paste actually ended.)
# ----------------------------- QTTS BUNDLE START -----------------------------
'''

FOOTER = '''
# ------------------------------ QTTS BUNDLE END ------------------------------
# Everything below is executed after the project has been unpacked.

import base64 as _b64, hashlib as _sha, os as _os, subprocess as _sp, sys as _sys, time as _t, zlib as _zl
from pathlib import Path as _Path

_ROOT = _Path("/kaggle/working/qtts") if _Path("/kaggle/working").exists() else _Path.cwd() / "qtts"


def _unpack() -> int:
    n = 0
    for _rel, (_h, _data) in FILES.items():
        try:
            _raw = _zl.decompress(_b64.b64decode(_data))
        except Exception as _e:  # noqa: BLE001
            raise SystemExit("✗ 粘贴内容损坏或被截断（%s）：%s —— 请重新完整复制整段代码" % (_rel, _e))
        if _sha.sha256(_raw).hexdigest()[:12] != _h:
            raise SystemExit("✗ 粘贴内容损坏或被截断：%s —— 请重新完整复制整段代码" % _rel)
        _p = _ROOT / _rel
        _p.parent.mkdir(parents=True, exist_ok=True)
        _p.write_bytes(_raw)
        n += 1
    print("✓ 已写入 %d 个文件 → %s" % (n, _ROOT))
    return n


_unpack()

# Kaggle Secrets -> environment (child processes inherit it)
try:
    from kaggle_secrets import UserSecretsClient
    _us = UserSecretsClient()
    for _k in ("DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL", "HF_TOKEN",
               "KAGGLE_USERNAME", "KAGGLE_KEY"):
        try:
            _os.environ[_k] = _us.get_secret(_k)
            print("✓ secret %s 已加载" % _k)
        except Exception:  # noqa: BLE001
            pass
except Exception:  # noqa: BLE001
    pass

_os.environ.setdefault("QTTS_STATE", str(_ROOT / "state"))
_os.environ.setdefault("PYTHONUNBUFFERED", "1")
_os.environ.setdefault("QTTS_ROOT", str(_ROOT))

print("\\n" + "═" * 72)
print("  QTTS 启动中：安装依赖 → 编译 Go 网关 / Rust 运行时 → 加载 Qwen3-TTS 1.7B x2")
print("  首次运行约 8–15 分钟（模型下载 + CUDA Graph 捕获）。请勿关闭页面。")
print("═" * 72 + "\\n")

_p = _sp.Popen([_sys.executable, str(_ROOT / "py" / "bootstrap.py")],
               stdout=_sp.PIPE, stderr=_sp.STDOUT, text=True, bufsize=1, env=_os.environ.copy())
for _line in _p.stdout:
    print(_line.rstrip(), flush=True)
_rc = _p.wait()
print("\\n" + ("✓ 启动完成：打开上面的 URL。"
              "自检：!python %s/tools/selftest.py --quality" % _ROOT
              if _rc == 0 else
              "✗ 启动失败(exit %d) —— 请把上面最后 40 行输出发给我" % _rc))
'''


def _encode(rel: str, src: str) -> tuple[str, str]:
    p = ROOT / src
    if not p.exists():
        raise SystemExit(f"missing source file: {src}")
    raw = p.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()[:12]
    blob = base64.b64encode(zlib.compress(raw, 9)).decode("ascii")
    # wrap at 96 chars so the generated file stays diff-friendly
    lines = [blob[i:i + 96] for i in range(0, len(blob), 96)]
    body = "\n".join('        "%s"' % ln for ln in lines)
    return digest, body


def build() -> str:
    parts = [HEADER, "import base64, hashlib, os, subprocess, sys, time, zlib\n",
             "from pathlib import Path\n\n",
             'ROOT = Path("/kaggle/working/qtts") if Path("/kaggle/working").exists() else Path.cwd() / "qtts"\n\n',
             "FILES = {\n"]
    for rel, src, _mode in FILES:
        digest, body = _encode(rel, src)
        parts.append('    %r: (\n        "%s", (\n%s\n    )),\n' % (rel, digest, body))
    parts.append("}\n")
    parts.append(FOOTER)
    text = "".join(parts)
    OUT.write_text(text, encoding="utf-8")
    SIM_COPY.write_bytes(OUT.read_bytes())   # same bytes → the simulator can copy the real bundle
    return text


def check() -> int:
    """Verify the shipped bundle decodes to exactly the current source tree."""
    if not OUT.exists():
        print("✗ yuyinkelong missing")
        return 1
    src = OUT.read_text(encoding="utf-8")
    try:
        compile(src, str(OUT), "exec")   # the pasted cell must be valid Python
    except SyntaxError as e:
        print(f"✗ yuyinkelong is not valid Python: {e}")
        return 1
    magic = [i for i, ln in enumerate(src.splitlines(), 1) if ln[:1] in ("!", "%", "?")]
    if magic:
        print(f"✗ IPython-hostile lines (start with ! % ?): {magic[:5]} — reformat them")
        return 1
    m = re.search(r"^FILES = \{", src, re.M)
    if not m:
        print("✗ no FILES table in the bundle")
        return 1
    i = m.start() + len("FILES = ")
    depth, j = 0, i
    while True:
        c = src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    ns: dict = {}
    exec("FILES = " + src[i:j + 1], ns)  # noqa: S102 - our own generated literal
    files = ns["FILES"]
    bad = 0
    expected = {rel: src for rel, src, _ in FILES}
    for rel in sorted(set(files) | set(expected)):
        if rel not in files:
            print(f"  ✗ {rel}: missing from bundle")
            bad += 1
            continue
        if rel not in expected:
            print(f"  ✗ {rel}: unexpected file in bundle")
            bad += 1
            continue
        raw = zlib.decompress(base64.b64decode(files[rel][1]))
        disk = (ROOT / expected[rel]).read_bytes()
        if raw != disk:
            print(f"  ✗ {rel}: bundle payload differs from the source tree")
            bad += 1
    if bad:
        print(f"\n{bad} mismatch(es) → run: python build_bundle.py")
        return 1
    if not SIM_COPY.exists() or SIM_COPY.read_bytes() != OUT.read_bytes():
        print("✗ web/sim-bundle.txt missing or differs from yuyinkelong — run: python build_bundle.py")
        bad += 1
        return 1
    print(f"✓ bundle is in sync with the source tree ({len(files)} files)")
    print("✓ web/sim-bundle.txt == yuyinkelong (simulator copies the real bundle)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify instead of rebuild")
    a = ap.parse_args()
    if a.check:
        return check()
    text = build()
    print(f"✓ wrote {OUT.relative_to(ROOT)}  ({len(text):,} bytes)")
    return check()


if __name__ == "__main__":
    sys.exit(main())
