# QA-066

# ViiTorVoice双T4 GPU任务调度与资源分配方案确认


## 一、问题背景

ViiTorVoice部署在Kaggle双T4环境。

如果GPU任务分配不合理：

可能出现：

- GPU0满载；
- GPU1空闲；
- 显存竞争；
- 推理等待。


需要设计动态GPU调度系统。


---

# 二、具体提问

如何设计双T4资源调度系统，使LLM、TTS、Audio Runtime任务能够高效并行运行？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Adaptive Dual-T4 Resource Scheduler（推荐）


---

# 五、整体架构


Global Scheduler


↓

GPU Resource Monitor


↓

Task Queue


↓

----------------


GPU0 Worker


GPU1 Worker


----------------


↓

Telemetry Feedback


---

# 六、GPU0任务


主要负责：

## Qwen3-TTS推理


包括：

- 声音克隆；
- 音频生成。


---

## Voice Encoder


负责：

- Speaker Embedding；
- Prompt Cache生成。


---

## CUDA Graph


负责：

降低：

- Kernel启动开销；
- 推理延迟。


---

# 七、GPU1任务


主要负责：


## DeepSeek / LLM


负责：

- 文本生成；
- 流式输出。


---

## Segmenter


负责：

- 文本切分；
- TTS调度。


---

## Prediction任务


负责：

- Buffer预测；
- 调度辅助。


---

# 八、Resource Monitor


监控：

- GPU显存；
- GPU利用率；
- Worker状态；
- Queue长度。


---

# 九、Dynamic Scheduler


根据：

- GPU负载；
- 任务优先级；
- 显存状态；

动态调整任务。


---

# 十、OOM保护


检测：

显存不足。


处理：

- 降低任务；
- 等待资源；
- 恢复Worker。


---

# 十一、方案B


固定GPU任务绑定。


优势：

简单。


缺点：

负载变化时效率下降。


---

# 十二、方案C


所有任务自动共享GPU。


优势：

简单。


缺点：

资源竞争不可控。


---

# 十三、最终技术路线


采用：

Adaptive Dual-T4 Resource Scheduler。


---

# 十四、验证要求


测试：

- GPU利用率；
- 显存稳定；
- 推理速度；
- 长时间运行；
- 任务恢复。


---

# 十五、状态

QA-066完成。
