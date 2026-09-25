# QA-028

# ViiTorVoice双T4 Worker调度与GPU开发语言方案确认


## 一、问题背景

ViiTorVoice需要在Kaggle双T4环境运行。


要求：

- 两张T4稳定工作；
- 音质一致；
- 降低延迟；
- 提高吞吐。


同时需要确定：

GPU相关模块应该使用什么编程语言开发。


---

# 二、具体提问

双T4语音克隆系统应该如何设计GPU Worker架构？

GPU优化应该使用哪些语言组合？


---

# 三、用户选择

选择：

A


---

# 四、双T4架构


采用：

专用双Worker + Central Scheduler。


结构：


Master Scheduler

↓

GPU Worker Pool


↓

GPU0 Worker

GPU1 Worker


↓

Rust Audio Runtime


---

# 五、GPU Worker策略


GPU0和GPU1：


保持：

- 相同模型；
- 相同参数；
- 相同Prompt Cache；
- 相同推理流程。


保证：

双GPU输出一致。


---

# 六、语言组合方案


## Python


负责：

- LLM；
- Qwen3-TTS；
- PyTorch；
- AI逻辑。


原因：

AI生态完整。


---

## CUDA/C++


负责：

- CUDA Kernel；
- CUDA Graph；
- Tensor优化；
- GPU底层加速。


原因：

最高GPU性能。


---

## Rust


负责：

- 实时音频Runtime；
- Ring Buffer；
- Watchdog；
- 调度通信。


原因：

低延迟和内存安全。


---

## TypeScript


负责：

- WebAudio；
- AudioWorklet；
- 浏览器播放。


原因：

浏览器实时音频标准。


---

## Go（可选）


负责：

- 后台服务；
- API管理；
- 任务控制。


---

# 七、最终系统分层


TypeScript

↓

Rust Runtime

↓

Python AI Layer

↓

CUDA/C++ Optimization


---

# 八、开发原则


不要单语言开发。


根据任务选择最适合语言。


---

# 九、验证要求


必须测试：

- GPU利用率；
- 推理速度；
- 双GPU一致性；
- 音频质量。


---

# 十、状态

QA-028完成。
