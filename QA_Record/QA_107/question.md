# QA-107

# ViiTorVoice TTS推理性能优化与GPU调度设计方案确认


## 一、问题背景

ViiTorVoice采用双T4 GPU架构：

GPU0：

- TTS；
- Speaker Encoder；
- Audio Engine。


GPU1：

- LLM；
- Text Processing。


需要优化GPU利用率和实时延迟。


---

# 二、具体提问

如何设计ViiTorVoice GPU Runtime，使双T4环境下实现动态任务调度、低延迟推理和高资源利用率？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Adaptive GPU Runtime Scheduler（推荐）


---

# 五、整体架构


Request


↓

Scheduler


↓

GPU Runtime


↓

Inference Worker


↓

Audio Stream


---

# 六、Scheduler


负责：

- 请求排队；
- 优先级管理；
- GPU选择。


---

# 七、GPU Runtime


负责：

- 模型运行；
- 显存管理；
- 推理执行。


---

# 八、Inference Worker


负责：

执行：

- TTS；
- Speaker Encoder；
- LLM任务。


---

# 九、优化策略


包括：

- FP16/BF16；
- Tensor优化；
- CUDA优化；
- Batch动态调整。


---

# 十、显存管理


包括：

- 模型常驻；
- KV Cache；
- Memory Pool。


---

# 十一、方案B


固定GPU分配。


优势：

简单。


缺点：

资源利用率不足。


---

# 十二、方案C


CPU负责调度。


优势：

容易实现。


缺点：

GPU性能无法充分利用。


---

# 十三、最终技术路线


采用：

Adaptive GPU Runtime Scheduler。


---

# 十四、验证要求


测试：

- 双GPU负载；
- 推理延迟；
- Batch效果；
- 长时间运行。


---

# 十五、状态

QA-107完成。
