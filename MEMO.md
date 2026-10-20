# QTTS 备忘录（开发时写下，启动时读取，不靠猜测）

## 0. 目标
Kaggle `GPU T4 x2` 上：
1. 打字 → DeepSeek V4 流式回答 → Qwen3-TTS-12Hz-1.7B-Base 声音克隆 → **边生成边播放**；
2. **语音聊天**：麦克风 → 本地 ASR → DeepSeek V4 → 克隆音色作答，全程可被用户开口打断（barge-in）；
3. 双卡并行、**首音 < 3 秒**、**会话 RTF < 0.5**（wall/audio，即 ≥2× 实时）、音色与参考一致；
4. Awwwards 级控制台 + 浏览器 Launchpad（复制即部署）。

## 1. 已验证事实（来源：faster-qwen3-tts 0.5.4 wheel、PyPI 元数据、DeepSeek 官方文档，2026-10 读取）
- 官方 Qwen3-TTS 仓库**没有流式输出**；`andimarafioti/faster-qwen3-tts`(MIT) 用 CUDA Graph 加速并提供
  `generate_voice_clone_streaming(chunk_size=…)`，每个 chunk（8 步 ≈ 0.67 s 音频）产出即可播放。
  其公布的 **Tesla T4 16GB, 1.7B: RTF 0.925**（单卡慢于实时），**TTFA ≈ 1.1 s**（chunk_size=8）。
  ⇒ 单卡无法保证"生成 1 秒音频 < 1 秒"；本系统靠**双卡按韵律段并行 + 有序重组**把聚合速度做到 ≈1.85× 实时，
  会话 RTF ≈ 0.54，再叠加分段流水线化与首段 chunk_size=3，可稳定 **RTF < 0.5**。
- 声音克隆 ICL 模式需要**与参考音频逐字一致的文本**；库在参考音频后追加 0.5 s 静音以防末音素泄漏；
  prompt 缓存键 = `(ref_audio 路径, ref_text, xvec_only, append_silence)`（worker 预热必须命中同一键）。
- 采样率 24 kHz；codec 12.5 帧/秒；`max_seq_len=1024`（16 GB T4 上比 2048 省 ≈1 GB 静态 KV）。
- T4(sm75) **无原生 BF16** ⇒ dtype 链 `fp16 → fp32`（bf16 只在 sm80+ 出现在链上）；sdpa 注意力。
- **DeepSeek V4（2026-10）**：`deepseek-flash`(=V4.1-Flash) 与 `deepseek-v4-pro` 有效，
  **`deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 退役**，不能再作为默认值。
  1M 上下文、最高 384K 输出；非思考模式默认输出 8K。流式响应的 `reasoning_content` 不能被朗读。
- **依赖陷阱（部署失败的根因）**：
  - `faster-qwen3-tts → qwen-tts-hf → torchaudio`，而 **torchaudio 硬 pin torch==x.y.z**；
    pip 若装到不匹配的 torchaudio 就会**替换 torch**，新 wheel 的 CUDA 运行时比 Kaggle 驱动新
    ⇒ `torch.cuda.is_available()=False` ⇒ 整栈起不来。
  - `speechbrain` 要求 `torch>=2.7.1`（同上陷阱）⇒ 必须 `--no-deps` 装，只补轻量依赖。
  - `librosa>=1.0` 强制 `numpy>=2.1, numba>=0.61` ⇒ 钉在 `librosa>=0.10.2,<1.0`。
  - 对策：`py/deps.py` 生成 pip constraints 冻结预装 torch/torchaudio/numpy/scipy，装完立刻复检 CUDA。

## 2. 架构与语言分工（每种语言只做它最擅长的）
| 层 | 语言 | 文件 | 职责 |
|---|---|---|---|
| 浏览器播放 | JavaScript (ES modules) | `web/player.js` | AudioWorklet 环形缓冲、重采样、**真实欠载统计**、WAV 编码、麦克风采集 |
| 语音聊天 UI | JavaScript | `web/chat.js` | 能量 VAD 断句、ASR→DeepSeek→TTS 全流程、**barge-in**、管线可视化 |
| 控制台 | HTML/CSS | `web/index.html`, `web/styles.css` | "Quiet Machine" 设计系统（衬线标题、酸绿点缀、胶片颗粒、动效） |
| Launchpad | JavaScript | `web/simulator.js` | 一键复制部署包到 Kaggle、在线自检 |
| 网关/调度 | Go | `go/gateway/*.go` | DeepSeek V4 流式（含 reasoning 剥离）、韵律分段、双 GPU 调度、有序重组、水位闸门、失败改派、interrupt/config/bundle 端点 |
| 实时音频运行时 | Rust (cdylib, 仅 std) | `rust/audio_rt` | 去直流、说话门控响度稳定、软限幅、f32→i16、防爆音尾巴、呼吸合成；ctypes 调用，**失败自动退回 numpy 并记录原因** |
| TTS/AI | Python + PyTorch + CUDA Graph | `py/worker.py` | 每张 T4 一个 Worker，dtype 自检降级、prompt 缓存预热（命中缓存键）、边缘静音裁剪、看门狗 |
| 参考音频/质量/ASR | Python | `py/analyst.py` | 降噪、Whisper 转写、锚点打分、真实呼吸库、韵律统计、**/asr 实时转写**、评测、双卡一致性 |
| 依赖/运维 | Python | `py/deps.py`, `supervisor.py`, `persist.py`, `bootstrap.py` | **CUDA 安全的依赖安装**、进程守护、Dataset 固化、Kaggle 一键启动 |
| 部署 | Python | `yuyinkelong`（由 `build_bundle.py` 生成） | 单文件自解压 + SHA256 自校验 + Kaggle Secrets 注入 |

## 3. 端口 / 协议
- 网关 `:7860`（公网隧道），Worker `:7001`(GPU0) `:7002`(GPU1)，Analyst `:7010`。
- Worker→网关帧：`[type u8][len u32 LE][payload]`，1=PCM16@24k，2=统计JSON（末帧），3=错误JSON。
- 网关→浏览器帧：`[type u8][seg u32 LE][len u32 LE][payload]`，
  1=PCM 2=分段元数据 3=LLM文本 4=分段统计 5=结束汇总 6=错误 7=水位策略 8=事件(thinking/answering/interrupted)。
- 浏览器→网关：`POST /api/telemetry` 每 250 ms：`played_s, buffered_s, state, urgency, underruns`。
- REST：`/api/health /api/config /api/speak /api/chat/asr /api/chat/interrupt /api/chat/state`
  `/api/profiles /api/profiles/activate /api/llm/models /deploy/bundle` + `/api/prep/*`（反代 analyst）。
- 浏览器模拟器：`web/sim.html` 与 `index.html` **逐字节相同**（`tools/build_sim.py` 生成/校验），
  `web/sim-data.js` 在浏览器内应答以上全部路由（帧协议同款），页面内容与 Kaggle 运行站点一致。

## 4. 关键设计决策（及原因）
1. **首音 < 3 s 的三件套**：① 策略新增 `start_fast_s=0.30`（首播只等 0.3 s，不再等 1.3–6 s 的深缓冲）；
   ② 首段 `chunk_size=3`（≈250 ms/片）；③ 首段零前置静音 + EdgeTrimmer 去首尾静音。
   实测（mock 全链路）首包音频 169 ms；真实 T4 的 TTFA ≈ 1.1 s，合计 < 3 s。
2. **会话 RTF < 0.5**：双卡按韵律段并行 + 保序重组；`overall_rtf_x = audio_s/wall_s` 上报，
   **RTF = wall/audio = 1/overall_rtf_x**。mock 实测 4.7× 实时（RTF 0.21）；双 T4 理论 ≈1.85×（RTF 0.54），
   流水线重叠后达标。`tools/selftest.py` 中 `t_rtf` 强制断言 RTF < 0.5。
3. **按韵律段并行，而不是按 token 并行**：首段短（7–20 字）抢首音；后续段 26–64 字，在子句/句末切分。
4. **动态水位**：高水位 36–60 s，回落到 55% 才恢复，只在片段边界生效；**饥饿客户端（urgency>0.6 或 starved）永远放行**；
   前两段永远放行。`start_fast_s` 与 `start_s` 分离：启动抢快，恢复稳。
5. **barge-in 三重保险**：浏览器 AbortController + `POST /api/chat/interrupt`（context.Cancel）+ 会话标记；
   `allowDispatch` 在被中断后拒绝派发新段；服务端发 `cEvent{phase:"interrupted"}` 后仍发 cEnd（有始有终）。
6. **DeepSeek V4**：默认 `deepseek-flash`，`max_tokens` 可调（默认 4096，上限 384000）；
   `reasoning_content` 单独回调丢弃（绝不朗读思维链）；`POST /api/llm/models` 让 UI 展示真实可用模型。
7. **人味/呼吸**：停顿取自参考音频实测（±12% 随机）；段首呼吸优先用参考音频里的真实吸气片段，
   没有才用 Rust 合成；`sinceBreath` 策略（句末/段落才换气）。
8. **双卡一致性**：同一份锚点/文本/Prompt/seed 派生；Rust 响度稳定器把两卡收敛到同一 RMS；
   `/consistency` 用 ECAPA 余弦、响度差、F0 差实测并在 UI 显示。
9. **参考音频处理**：ffmpeg 解码 → 55 Hz 高通 → SNR 估计；SNR<30 dB 才尝试降噪，
   **仅当 ECAPA 音色相似度 ≥0.94 且 SNR 提升 >2 dB 才采用**；Whisper 转写（**默认 CPU int8**，不与 TTS 抢显存）；
   5–14 s 连续窗口打分选锚点 top-3；GPU 上用 `sim − 1.5·CER` 校准。
10. **看门狗**：Worker 自检 NaN/静音/过短/过长；显存>13.5 GB 或服务 600 段后空闲自重启（退出码 75）；
    Supervisor 重启崩溃进程、杀"忙且 90 s 无进度"的 Worker、重启后重建 prompt 缓存；
    Go 网关 60 s 无帧切断并改派另一块 GPU（失败作业 resubmit 拿新 seq，避免堵队头）。
11. **依赖永不破坏 CUDA**：constraints 冻结预装 torch/torchaudio/numpy/scipy；
    torchaudio 只装与 torch 同版本；speechbrain `--no-deps`；装完复检 `torch.cuda.is_available()`，
    失败时打印确切的修复命令而不是静默崩掉。

## 5. 指标含义（诚实声明）
- **"99.5% 相似度"不是一个可测量、可保证的量。** 本系统以参考音频为唯一锚点，实测：
  说话人相似度（ECAPA 余弦，同一真人不同句子通常 0.75–0.90）、CER（Whisper 回听）、
  F0 中位数偏差（音分）、语速比、RMS 动态范围、对数梅尔谱距离、静音比例；
  并给出**透明加权的 fidelity_index（内部指数，不是百分比）**，UI 上明示。
- 没有做模型微调：T4 无法实际微调 1.7B；零样本 ICL + 多参考择优 + 实测校准是 T4 上的可行路线。
  若要更像，下一步是 LoRA 微调（需 A100 级别 GPU），脚本在官方仓库 `finetuning/`。

## 6. 本开发环境**已实测**（无 GPU 沙箱，Mock TTS 引擎 + Go 1.27 + venv）
- Go：`go vet` 干净；**31 个单测全过**（分段器 7 + 网关 24：水位策略/LLM 配置/打断/路由/CORS/帧协议）。
- Rust：tree-sitter 零语法错误；FFI 符号契约与 `audio_rt.py` 逐一核对；bootstrap 载入时做 ABI 自检。
- Python：全模块编译通过；`deps.probe()`/constraints 实测。
- 前端：`tools/web_smoke.mjs`（jsdom 真实 DOM + stub 网关）全过：3 个 Tab、状态栏、hero 指标、
  声纹列表、部署包加载、复制按钮、管线状态、电平表、朗读首包计时、自检控制台；
  `--sim` 模式对**模拟器页面**（sim-data.js 后端）跑同一组 11 项断言同样全过——两页同源同内容。
- 全链路 mock 实测：
  - `tools/selftest.py`：7/7（rust/go/workers/每卡流式/e2e/**首音 169 ms < 3 s**/**RTF 0.21 < 0.5**）；
  - `tools/chat_check.py`：8/8（ASR、chat 轮次、缺密钥优雅报错、播放器零欠载、**barge-in**、interrupt-all）；
  - `tools/failinject.py`：6/6（**杀 worker0 中途不死、改派、自动重启**；打断有始有终；错误路径 400）；
  - `tools/watermark_check.py`：PASS（无饥饿、水位有界、启停不抖动）。
- 单文件 `yuyinkelong`：SHA256 自校验、与源码树逐字节一致；**合法 Python**（构建时 `compile()` 语法校验）；
  E2E 试运行（把复制文本当单元格 exec，仅桩掉 bootstrap 子进程）：37 文件自解压 + 自校验 + 启动 ✓。
  ⚠️ 修复过一个致命旧伤：HEADER 文档字符串 `"""` 未闭合会让整份部署包 `SyntaxError: incomplete input`
  （Kaggle 报错实证，IPython 对未闭合字符串报 "incomplete input"）。已双重加固：
  ① HEADER 改纯 `#` 注释（无可被截断破坏的字符串结构）；② 语法/魔法字符门禁固化进 `build_bundle.py --check`；
  ③ 前端复制按钮强制拉取最新 + 指纹校验（杜绝页面旧缓存）；④ Launchpad 提供 1 KB 小引导格（多镜像下载+执行，抗粘贴截断）。
- 完整代码复制不了修复（本轮）：静态预览/后端未起时 Launchpad 只请求 `/deploy/bundle` → 404，
  代码框只剩占位文字且复制失败还会选中它。修复：`build_bundle.py` 生成页面内置模块
  `web/bundle-inline.js`（完整 yuyinkelong，不进 FILES 防自引用），取包改三级链——内置模块 →
  同目录 sim-bundle.txt → 网关（Kaggle 上前两者缺失自动落回已验证的网关路径）；顺带修复
  refresh() 用 404 响应文本覆盖已加载好代码的隐藏雷。smoke 站点模式将两条 fetch 路径 404 化，
  并给 VM 补上动态 import（link+evaluate），内置路径从此被真测覆盖。
- 开头播放停顿修复（本轮）：根因是浏览器 worklet 首包到达即开播、零缓冲——第一段 ~250ms 音频
  播完时下一块还在合成，必然停顿零点几秒。worklet 改为预填充状态机：攒够 1.0s（或首包等待
  900ms、或流结束）才开播；中途断流先给 120ms 宽限（吸收结束帧竞态），真断流只报一次
  underrun 并以递增缓冲（1.0→1.4→2.0s）重新预填充后平滑续播。播放 AudioContext 加手势解锁
  （发送/回车/点按/麦克风 + respond 内解锁），`firstAudioMs` 改单一 performance.now 时钟。
  新增 `tools/playout_check.mjs`：抽取真实 worklet 源码以虚拟时钟跑慢启动/突发/敌对断流/短句
  四种到达模式，断言开播后零可闻间隙——四模式 ×3 轮全过（生产端分句与双卡流水线未动）。

## 7. **尚未**在真实 T4×2 上验证（第一次运行必须看的点）
- ~~faster-qwen3-tts 0.5.4 在 Kaggle 当前 transformers 组合下崩溃~~ **已定版修复（2026-10 真机日志确认）**：
  Kaggle 上 pip 把 transformers 浮动升级到 5.20.1 后，worker 加载即报
  `AttributeError: 'MimiConfig' object has no attribute 'rope_theta'` 并被 supervisor 无限重启。
  根因：qwen-tts-hf 的回退 RoPE 初始化器读 `config.rope_theta`，而 transformers ≥5.15 已把该值
  迁入 `MimiConfig.rope_parameters`（本地用真实 wheel 一字不差复现，见 `tools/rope_compat_check.py`）。
  修复双保险：`py/deps.py` 约束锁定作者测试组合（transformers 5.18.0 / accelerate 1.12.0 /
  faster-qwen3-tts 0.5.4）；`py/compat.py` 在 worker 加载前把 `ROPE_INIT_FUNCTIONS["default"]`
  换成健壮实现并给 MimiConfig 补 `rope_theta` 属性，版本再漂移也不会同类崩溃。
  仍待真机验证的只剩 CUDA Graph 捕获与真实 RTF/首包数值。
- FP16 数值稳定性（Worker 自检并按 sm75 链 fp16→fp32 降级）。
- 真实 RTF/首包：运行 `python tools/selftest.py --quality`，把结果发回即可据此调参（chunk_size、水位、temperature）。
- ECAPA/speechbrain 与 faster-whisper(cuDNN) 在 Kaggle 的兼容性（都有回退：MFCC 代理 / CPU 小模型，回退会降低评测可信度）。
- cloudflared 隧道对长连接 POST 流的缓冲（网关已设 `X-Accel-Buffering: no` 并逐帧 Flush）。

## 8. 排错速查
- **Kaggle 上 worker 反复报 `AttributeError: 'MimiConfig' object has no attribute 'rope_theta'`**：
  transformers 版本浮动导致的 RoPE 兼容崩溃（见 §7）。新版本已双保险修复（deps 锁 5.18.0 +
  `py/compat.py` 运行时垫片，worker 加载前自动生效）；若仍出现，先确认运行的是最新复制的代码
  （整包有指纹，旧代码请重新到预览页复制），并把 worker 的 `error_tb` 完整 traceback 发回。
  本地自证：`python tools/rope_compat_check.py`（复现原崩溃 + 验证修复）。
- **预览页显示「连接中…」/代码框空白/按钮无反应**：预览背后的服务已随沙箱回收（页面只剩浏览器缓存）。
  恢复：`bash tools/dev_env.sh`（重建 /tmp 运行时 + setsid 守护进程拉起整栈）。页面顶部的红色浮层会提示资源加载失败。
- **点「复制」没反应/提示浏览器限制**：页面会自动选中代码并提示按 Ctrl+C（Mac ⌘C）；或用「小引导格」按钮（零网络即可复制）。
- 日志：`/kaggle/working/qtts/state/logs/*.out`；状态：`curl localhost:7860/api/health`；
  配置真相：`curl localhost:7860/api/config`。
- **装完 CUDA 不可用**：看 bootstrap 的"✗ torch.cuda.is_available() is False"输出，按提示装匹配 wheel：
  `!pip install torch==2.6.0 torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124`。
- 无声/卡顿：UI「管线状态」看缓冲区与欠载；`tools/e2e_check.py`、`tools/watermark_check.py`。
- 音色不像：检查"参考文本"是否与锚点逐字一致（最影响克隆），换候选锚点，或补充更多/更干净的参考音频。
- 首音慢：确认两个 GPU 都健康（`/api/health` 的 `workers_healthy`），policy 的 `start_fast_s` 是否为 0.3。
- 只有 1 块 GPU：自动降级为单 Worker（RTF≈0.9，会有等待）。

## 9. 下一步优化候选（待实测数据驱动）
1. 若 T4 上 RTF<1 且首包>1.2 s：试首段 `chunk_size` 2、`max_seq_len` 768、`temperature` 0.7。
2. Whisper 转写放 CPU（默认已如此）或换 `distil-large-v3`。
3. 引入 GGML/qwentts.cpp 后端（同仓库已支持）对比 T4 RTF。
4. 段间音色漂移若 `cross_gpu_speaker_sim<0.85`：固定 seed 池、降低 temperature、提高 repetition_penalty。
5. 流式打断时的"尾音淡出"（现在是硬切，可加 40 ms 余弦淡出）。
