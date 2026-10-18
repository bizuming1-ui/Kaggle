# QTTS — Qwen3-TTS 1.7B 声音克隆 · 双 T4 · 语音聊天

> 打字或说话 → DeepSeek V4 流式作答 → 韵律分句 → **双 T4 并行克隆合成** → 边生成边播放，
> **首音 < 3 秒**、**会话 RTF < 0.5**、随时开口可打断。一键部署到 Kaggle。

## 快速开始（Kaggle，约 3 分钟设置）

1. 新建 Notebook → ⚙ **Accelerator: GPU T4 ×2**，**Internet: On**
2. （可选，语音聊天需要）⚙ Secrets → 添加 `DEEPSEEK_API_KEY`、`HF_TOKEN`
3. 打开本仓库的 [`yuyinkelong`](./yuyinkelong)，**复制整段**，粘贴进**一个** Notebook 单元格，运行
4. 输出里的 `https://xxxx.trycloudflare.com` 就是控制台

也可以用浏览器里的 **Launchpad** 页签直接一键复制部署包。

## 浏览器模拟器（不上 Kaggle 先看效果）

[`web/sim.html`](./web/sim.html) 是**浏览器模拟器**：与 Kaggle 运行的网站**同一套页面源码**（由 `tools/build_sim.py` 从 `index.html` 逐字节生成），只是把网络层换成 `web/sim-data.js` 的浏览器内置模拟后端——双 T4 状态、克隆音色、延迟指标、流式合成帧全部就地应答。打开即见与 Kaggle 部署**完全一致**的页面内容，可交互试听、打断、跑自检。`tools/web_smoke.mjs --sim` 对两个页面跑同一组断言保证一致。

模拟器里的「复制」按钮给出的是**真实可运行的 `yuyinkelong` 部署包**（带 `✓ 可直接运行` 标记，按 shebang + BUNDLE 标记 + FILES 自校验逐项验证）：优先取网关 `/deploy/bundle`，其次 `web/sim-bundle.txt` 同源副本、GitHub raw / API；全部失败时明确报错，**绝不给假代码**。粘进 Kaggle 一个单元格即跑（构建时已做 `compile()` 语法校验 + 解包 SHA 自校验的 E2E 试运行）。

## 三个页签

| 页签 | 功能 |
|---|---|
| **声音实验室** | 上传/拖入参考音频 → 自动降噪·切片·锚点打分 → 声纹库 → **客观质量报告**（ECAPA 余弦 / CER / F0 / 语速 / mel 谱距离 / fidelity 指数）→ 试听 |
| **语音聊天** | 麦克风能量 VAD 断句 → 本地 ASR → DeepSeek V4 流式 → 克隆音色作答；**说话即打断**（barge-in）；管线状态实时可视化 |
| **Launchpad** | 一键复制 `yuyinkelong` 到 Kaggle、等价终端命令、在线自检（含真实合成探针测首包） |

## 指标口径（诚实声明）

| 承诺 | 口径 | 在哪断言 |
|---|---|---|
| 首音 < 3 s | 从 `POST /api/speak` 到**第一片可播 PCM** 抵达浏览器 | `tools/selftest.py::t_first_audio` |
| RTF < 0.5 | 会话墙钟 / 音频时长（越小越快；0.5 = ≥2× 实时） | `tools/selftest.py::t_rtf` |
| 音色相似 | ECAPA 余弦 + CER + F0 偏移 + 语速比 + mel 谱距离的**实测** | 声音实验室质量报告 |
| ⚠️ "99.5% 相似度" | **不提供**——没有任何可复现的测量能证明它；UI 上会说明原因 | — |

## 架构（每种语言只做它最擅长的）

```
浏览器 (JS)        AudioWorklet 环形缓冲 · 真实欠载统计 · 能量 VAD · Awwwards 级 UI
  │ 帧协议
网关 (Go)          DeepSeek V4 流式 · 韵律分段器 · 双 GPU 调度 · 保序重组 · 水位闸门 · interrupt
  │ HTTP 流
Worker ×2 (Python) Qwen3-TTS 1.7B + CUDA Graph · dtype 自检(fp16→fp32) · prompt 缓存 · 看门狗
  │ ctypes
Rust 运行时        去直流 · 响度稳定 · 软限幅 · 呼吸合成（失败自动退 numpy）
Analyst (Python)   降噪 · Whisper ASR · 锚点打分 · 质量评测 · 双卡一致性
```

## 仓库结构

```
yuyinkelong          ← 单文件部署包（粘贴进 Kaggle 一个单元格即可）
build_bundle.py      ← 由源码树生成/校验 yuyinkelong
py/                  ← bootstrap / deps(CUDA 安全安装) / worker / analyst / chat / supervisor / persist
go/gateway/          ← Go 网关（31 个单测）
rust/audio_rt/       ← Rust 实时音频运行时（5 个单测）
web/                 ← 控制台（index.html + sim.html 模拟器 + styles.css + app/player/chat/simulator/sim-data.js）
tools/               ← selftest / e2e_check / chat_check / failinject / watermark_check / web_smoke / build_sim
MEMO.md              ← 设计决策、实测数据、诚实声明、排错速查
```

## 自检（部署成功后）

```bash
python tools/selftest.py --quality        # 7 项 + 质量/双卡一致性
python tools/chat_check.py                # 语音聊天 8 项（含 barge-in）
python tools/failinject.py                # 故障注入 6 项（杀 worker 中途不死）
python tools/watermark_check.py --repeat 8  # 水位闸门无饥饿/无抖动
```

前端自检（本地）：`npm i && npm test`（jsdom 真实 DOM 冒烟）。

## 常见问题

- **`torch.cuda.is_available()` 为 False**：pip 替换了预装 torch（torchaudio 硬 pin 所致）。
  按 bootstrap 输出的命令装匹配 wheel：`!pip install torch==2.6.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124`。
- **语音聊天没反应**：检查 Secrets 里的 `DEEPSEEK_API_KEY`；没有密钥也能朗读，只是不能对话。
- **首音慢**：`curl localhost:7860/api/health` 看 `workers_healthy` 是否为 2；单卡会明显变慢。

MIT · 实测数据见 [MEMO.md](./MEMO.md) 第 6、7 节。
