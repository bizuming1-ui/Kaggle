#!/usr/bin/env python3
"""One-click bootstrap for Kaggle (Accelerator: GPU T4 x2, Internet: On).

  1 detect GPUs + CUDA stack   2 install deps without breaking torch
  3 model pre-download (bg)    4 build Go gateway    5 build Rust runtime
  6 restore state (Dataset)    7 start supervisor    8 wait for both GPUs
  9 public tunnel

Every step is timed and every failure prints the actual cause - no silent
"failed to import" dead ends.  Safe to re-run: the old supervisor is stopped first.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deps  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
os.environ["QTTS_ROOT"] = str(ROOT)
STATE = Path(os.environ.setdefault("QTTS_STATE", str(ROOT / "state")))
TOOLS = ROOT / "tools_bin"
LOGS = STATE / "logs"
for d in (STATE, TOOLS, LOGS):
    d.mkdir(parents=True, exist_ok=True)
GATEWAY_PORT = int(os.environ.get("QTTS_GATEWAY_PORT", "7860"))
MODEL = os.environ.get("QTTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
T0 = time.time()
TIMES: dict[str, float] = {}


def step(name: str):
    class _S:
        def __enter__(self_):
            self_.t = time.time()
            print(f"\n━━ [{time.time() - T0:6.1f}s] {name}", flush=True)

        def __exit__(self_, *a):
            TIMES[name] = time.time() - self_.t
            print(f"   ↳ {name}: {TIMES[name]:.1f}s", flush=True)
    return _S()


def sh(cmd, check=True, env=None, cwd=None, quiet=False, timeout=None) -> int:
    e = {**os.environ, **(env or {})}
    p = subprocess.Popen(cmd, env=e, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, bufsize=1)
    tail: list[str] = []
    t_end = time.time() + timeout if timeout else None
    assert p.stdout
    for line in p.stdout:
        tail.append(line)
        tail = tail[-40:]
        if not quiet:
            print("   " + line.rstrip()[:200], flush=True)
        if t_end and time.time() > t_end:
            p.kill()
            break
    rc = p.wait()
    if rc != 0 and check:
        print("".join(tail))
        raise RuntimeError(f"command failed ({rc}): {' '.join(map(str, cmd))[:160]}")
    return rc


def detect_gpus() -> int:
    try:
        out = subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True, timeout=20).stdout
    except Exception:  # noqa: BLE001
        out = ""
    gpus = [l for l in out.splitlines() if l.startswith("GPU ")]
    for g in gpus:
        print("   " + g)
    return len(gpus)


def print_env_table() -> deps.Probe:
    p = deps.probe()
    print("   ── CUDA stack ──────────────────────────────────────────────")
    print(f"   driver CUDA        : {p.driver_cuda or 'unknown'}")
    print(f"   torch              : {p.torch or 'not installed'}"
          f"{' (cuda ' + str(p.torch_cuda) + ')' if p.torch_cuda else ''}")
    print(f"   torchaudio         : {p.torchaudio or 'not installed'}")
    print(f"   numpy / scipy      : {p.numpy or '-'} / {p.scipy or '-'}")
    print(f"   torch.cuda.is_available(): {p.cuda_available}")
    print(f"   visible GPUs       : {p.device_count} {p.gpu_names}")
    if not p.cuda_available:
        print("   ⚠ CUDA is not usable yet - the dependency step will repair or explain this.")
    print("   ───────────────────────────────────────────────────────────")
    return p


def ensure_go() -> str:
    g = shutil.which("go")
    if g:
        try:
            subprocess.run([g, "version"], capture_output=True, timeout=20)
            return g
        except Exception:  # noqa: BLE001
            pass
    goroot = TOOLS / "go"
    exe = goroot / "bin" / "go"
    if exe.exists():
        try:
            subprocess.run([str(exe), "version"], capture_output=True, timeout=20)
            return str(exe)
        except Exception:  # noqa: BLE001
            pass
    versions = [os.environ.get("QTTS_GO_VERSION", "go1.23.4"), "go1.23.4", "go1.22.10", "go1.21.13"]
    for ver in versions:
        tgz = TOOLS / f"{ver}.linux-amd64.tar.gz"
        urls = [
            f"https://go.dev/dl/{ver}.linux-amd64.tar.gz",
            f"https://dl.google.com/go/{ver}.linux-amd64.tar.gz",
            f"https://mirrors.aliyun.com/golang/{ver}.linux-amd64.tar.gz",
            f"https://mirrors.ustc.edu.cn/golang/{ver}.linux-amd64.tar.gz",
        ]
        for url in urls:
            try:
                print(f"   downloading {url}")
                urllib.request.urlretrieve(url, tgz)
                with tarfile.open(tgz) as tf:
                    try:
                        tf.extractall(TOOLS, filter="data")
                    except TypeError:  # Python < 3.12
                        tf.extractall(TOOLS)
                tgz.unlink(missing_ok=True)
                if exe.exists():
                    r = subprocess.run([str(exe), "version"], capture_output=True, text=True, timeout=30)
                    if r.returncode == 0:
                        print("   " + r.stdout.strip())
                        return str(exe)
            except Exception as e:  # noqa: BLE001
                print(f"   failed: {str(e)[:120]}")
    raise RuntimeError("could not install Go (is Internet enabled in the notebook settings?)")


def build_gateway():
    go = ensure_go()
    env = {"GOCACHE": "/tmp/qtts-gocache", "GOPATH": "/tmp/qtts-gopath", "GOFLAGS": "-mod=mod",
           "CGO_ENABLED": "0", "GOTOOLCHAIN": "local"}
    gdir = ROOT / "go" / "gateway"
    sh([go, "build", "-trimpath", "-ldflags", "-s -w", "-o", "gateway", "."], cwd=str(gdir), env=env)
    size = (gdir / "gateway").stat().st_size // 1024
    print("   gateway binary:", size, "KB")
    if size < 200:
        raise RuntimeError("gateway binary looks broken")


def build_rust() -> bool:
    cargo = shutil.which("cargo") or str(Path.home() / ".cargo" / "bin" / "cargo")
    if not Path(cargo).exists():
        try:
            sh(["bash", "-lc", "curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal "
                              "--default-toolchain stable >/tmp/rustup.log 2>&1"], timeout=600)
        except Exception as e:  # noqa: BLE001
            print("   rustup failed:", e)
        cargo = str(Path.home() / ".cargo" / "bin" / "cargo")
    if not Path(cargo).exists():
        print("   ⚠ Rust unavailable -> using the numpy fallback runtime (works, slightly slower)")
        return False
    rdir = ROOT / "rust" / "audio_rt"
    try:
        sh([cargo, "build", "--release", "--quiet"], cwd=str(rdir),
           env={"CARGO_TARGET_DIR": str(rdir / "target")})
        so = rdir / "target" / "release" / "libaudio_rt.so"
        if not so.exists():
            print("   ⚠ libaudio_rt.so missing -> numpy fallback")
            return False
        # the library must actually load and expose the expected ABI
        code = ("import ctypes,sys;l=ctypes.CDLL(sys.argv[1]);"
                "l.rt_version.restype=ctypes.c_uint32;print(l.rt_version())")
        r = subprocess.run([sys.executable, "-c", code, str(so)], capture_output=True, text=True, timeout=60)
        if r.returncode != 0 or int(r.stdout.strip() or 0) < 3:
            print("   ⚠ libaudio_rt.so ABI check failed -> numpy fallback:", r.stderr[-160:])
            return False
        print("   rust runtime:", so, so.stat().st_size // 1024, "KB  (ABI", r.stdout.strip(), ")")
        return True
    except Exception as e:  # noqa: BLE001
        print("   ⚠ Rust build failed -> numpy fallback:", str(e)[:200])
        return False


def preload_models(err: list):
    try:
        from huggingface_hub import snapshot_download
        tok = os.environ.get("HF_TOKEN") or None
        t = time.time()
        snapshot_download(MODEL, token=tok)
        print(f"   [bg] TTS model ready ({time.time() - t:.0f}s)", flush=True)
        for m in ("Systran/faster-whisper-large-v3",):
            try:
                snapshot_download(m, token=tok)
                print(f"   [bg] {m} ready", flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"   [bg] {m} download failed: {str(e)[:120]}", flush=True)
        try:
            snapshot_download("speechbrain/spkrec-ecapa-voxceleb",
                              local_dir=str(STATE / "models" / "ecapa"), token=tok)
            print("   [bg] ECAPA ready", flush=True)
        except Exception as e:  # noqa: BLE001
            print("   [bg] ECAPA download failed (MFCC proxy will be used):", str(e)[:120], flush=True)
    except Exception as e:  # noqa: BLE001
        err.append(str(e))


def cuda_lib_paths() -> str:
    """ctranslate2 (faster-whisper) needs cuDNN/cuBLAS on LD_LIBRARY_PATH; torch ships them."""
    code = ("import os,sys\nps=[]\n"
            "for m in ('nvidia.cudnn','nvidia.cublas'):\n"
            "  try:\n    mod=__import__(m,fromlist=['x']); ps.append(os.path.join(list(mod.__path__)[0],'lib'))\n"
            "  except Exception: pass\n"
            "print(os.pathsep.join(ps))")
    try:
        return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                              timeout=30).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def stop_old():
    pf = STATE / "supervisor.pid"
    if pf.exists():
        try:
            pid = int(pf.read_text())
            os.kill(pid, signal.SIGTERM)
            time.sleep(3)
        except Exception:  # noqa: BLE001
            pass
    subprocess.run("pkill -f cloudflared", shell=True, capture_output=True)
    for port in (GATEWAY_PORT, 7001, 7002, 7010):
        subprocess.run(f"fuser -k {port}/tcp", shell=True, capture_output=True)
    time.sleep(1)


def http_json(url: str, timeout=3):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode())


def wait_ready(n_workers: int, timeout_s: int = 1800) -> bool:
    t_end = time.time() + timeout_s
    last = 0.0
    while time.time() < t_end:
        try:
            h = http_json(f"http://127.0.0.1:{GATEWAY_PORT}/api/health")
            if h.get("workers_healthy", 0) >= n_workers:
                return True
            if time.time() - last > 15:
                last = time.time()
                st = [(w["id"], "ready" if w.get("ready") else ((w.get("worker") or {}).get("error")
                      or w.get("last_error") or "loading")) for w in h.get("workers", [])]
                print(f"   [{time.time() - T0:6.0f}s] workers: {st}", flush=True)
                for w in h.get("workers", []):
                    tb = (w.get("worker") or {}).get("error_tb")
                    if tb and w.get("id") not in seen_tb:
                        seen_tb.add(w.get("id"))
                        print(f"   --- worker {w.get('id')} traceback (tail) ---\n"
                              + "\n".join(str(tb).splitlines()[-8:]), flush=True)
        except Exception:  # noqa: BLE001
            if time.time() - last > 15:
                last = time.time()
                print(f"   [{time.time() - T0:6.0f}s] waiting for gateway…", flush=True)
        time.sleep(3)
    return False


def start_tunnel() -> str | None:
    if os.environ.get("QTTS_TUNNEL", "cloudflared") == "none":
        return None
    exe = TOOLS / "cloudflared"
    if not exe.exists():
        urls = [
            "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
            "https://mirrors.aliyun.com/cloudflared/cloudflared-linux-amd64",
        ]
        for url in urls:
            try:
                urllib.request.urlretrieve(url, exe)
                exe.chmod(0o755)
                break
            except Exception as e:  # noqa: BLE001
                print("   tunnel download failed:", str(e)[:120])
                exe.unlink(missing_ok=True)
    if not exe.exists():
        return None
    logp = LOGS / "tunnel.log"
    logf = open(logp, "wb")
    subprocess.Popen([str(exe), "tunnel", "--url", f"http://127.0.0.1:{GATEWAY_PORT}", "--no-autoupdate"],
                     stdout=logf, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(90):
        try:
            m = re.search(rb"https://[-a-z0-9]+\.trycloudflare\.com", logp.read_bytes())
        except OSError:
            m = None
        if m:
            return m.group(0).decode()
        time.sleep(1)
    return None


def print_memo():
    """Read the memo (never guess): print its verified-facts and unverified-risks sections."""
    memo = ROOT / "MEMO.md"
    if not memo.exists():
        return
    txt = memo.read_text(encoding="utf-8")
    for title in ("## 1. ", "## 7. "):
        i = txt.find(title)
        if i >= 0:
            j = txt.find("\n## ", i + 5)
            block = txt[i: j if j > 0 else None].strip().splitlines()
            print("   " + block[0])
            for line in block[1:8]:
                print("   " + line[:170])
            if len(block) > 8:
                print("   … (full text: %s)" % memo)


def main() -> int:
    print("QTTS bootstrap  root=%s" % ROOT)
    print_memo()
    with step("1/9 detect GPUs"):
        n = detect_gpus()
        if n == 0:
            print("✗ No GPU visible. Notebook → Settings → Accelerator → GPU T4 x2, then restart the session.")
            return 2
        n_workers = min(n, 2)
        ports = ",".join(str(7001 + i) for i in range(n_workers))
        os.environ["QTTS_WORKER_PORTS"] = ports
        if n < 2:
            print("   ⚠ only 1 GPU: running single-worker (RTF will be ~0.9x, expect stalls). "
                  "Select 'GPU T4 x2'.")
    stop_old()

    with step("2/9 python dependencies (torch is never replaced)"):
        p = print_env_table()
        constraints = TOOLS / "constraints.txt"
        lines = deps.build_constraints(p, constraints)
        print("   pip constraints:", ", ".join(lines))
        res = deps.install_core(constraints, lambda m: print(m, flush=True))
        if not res.get("tts_ok"):
            print("   ✗ faster-qwen3-tts could not be installed. pip said:")
            print(res.get("tts_log", "")[-2500:])
            return 4
        ok, _ = deps.verify_cuda()
        if not ok:
            print("   ✗ torch.cuda.is_available() is False after the install.")
            print("      → your driver is older than the CUDA runtime the wheel needs.")
            print("      → install a matching wheel, e.g.:")
            print(f"        !pip install torch=={deps.FALLBACK_TORCH} torchvision torchaudio "
                  f"--index-url {deps.pip_index_url() or 'https://download.pytorch.org/whl/cu124'}")
            return 5
        deps.install_web(constraints)
        deps.install_optional(constraints, lambda m: print(m, flush=True))
        p2 = deps.probe()
        print(f"   torch: {p2.torch} (cuda {p2.torch_cuda})  torchaudio: {p2.torchaudio}  "
              f"cuda_ok={p2.cuda_available}  gpus={p2.device_count}")
        v = subprocess.run([sys.executable, "-c", "import faster_qwen3_tts as f;"
                            "print('faster_qwen3_tts', getattr(f,'__version__','?'))"],
                           capture_output=True, text=True).stdout.strip()
        print("   " + (v or "faster_qwen3_tts import FAILED"))
        ld = cuda_lib_paths()
        if ld:
            os.environ["LD_LIBRARY_PATH"] = ld + os.pathsep + os.environ.get("LD_LIBRARY_PATH", "")

    err: list[str] = []
    with step("3/9 start model download (background)"):
        th = threading.Thread(target=preload_models, args=(err,), daemon=True)
        th.start()

    with step("4/9 build Go gateway"):
        build_gateway()
    with step("5/9 build Rust audio runtime"):
        rust_ok = build_rust()
    with step("6/9 restore voice profiles (Dataset)"):
        try:
            import persist
            print("   restored:", persist.restore())
        except Exception as e:  # noqa: BLE001
            print("   restore skipped:", e)
    with step("   wait for model download"):
        th.join()
        if err:
            print("   ⚠ model download issue:", err[0][:200])
            print("     (the worker will retry the download on first use)")

    with step("7/9 start supervisor (workers, analyst, gateway)"):
        sup = subprocess.Popen([sys.executable, str(ROOT / "py" / "supervisor.py")],
                               stdout=open(LOGS / "supervisor.out", "ab"),
                               stderr=subprocess.STDOUT, start_new_session=True, env=os.environ.copy())
        print("   supervisor pid", sup.pid, "workers:", ports)
    with step("8/9 wait for GPUs (model load + CUDA-graph capture)"):
        ok = wait_ready(n_workers)
        if not ok:
            for f in ("worker0.out", "worker1.out", "analyst.out", "gateway.out", "supervisor.out"):
                p_ = LOGS / f
                if p_.exists():
                    print(f"--- {f} (tail)\n" + "\n".join(p_.read_text(errors="ignore").splitlines()[-25:]))
            print("✗ workers not ready in time")
            return 3
    url = None
    with step("9/9 public tunnel"):
        try:
            url = start_tunnel()
        except Exception as e:  # noqa: BLE001
            print("   tunnel failed:", e)
    local = f"http://127.0.0.1:{GATEWAY_PORT}"
    (STATE / "url.txt").write_text(url or local)
    print("\n" + "═" * 70)
    print(f"✓ QTTS ready in {time.time() - T0:.0f}s   GPUs: {n_workers}   "
          f"Rust runtime: {'on' if rust_ok else 'numpy fallback'}")
    print(f"  ★★★ 语音克隆系统网址（在浏览器打开）:  {url or local}  ★★★")
    print(f"  Open this URL:  {url or local}   (also saved in {STATE / 'url.txt'})")
    print("  1) 声音实验室: 上传参考音频 → 自动处理 → 启用   2) 语音聊天: 麦克风直接对话   3) 语音合成: 打字朗读")
    print("  Monitor: python {}/tools/selftest.py --quality   |   logs: {}".format(ROOT, LOGS))
    print("═" * 70)
    try:
        from IPython.display import HTML, display  # type: ignore
        display(HTML(f'<a href="{url or local}" target="_blank" style="font-size:18px">▶ 打开 QTTS 控制台</a>'))
    except Exception:  # noqa: BLE001
        pass
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        print("\n✗ bootstrap failed:", e)
        import traceback
        traceback.print_exc()
        sys.exit(1)
