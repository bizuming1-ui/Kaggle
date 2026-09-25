# QA-035

# ViiTorVoice双T4 GPU Worker架构设计方案确认


## 一、问题背景

Kaggle环境提供双T4 GPU。


目标：

充分利用：

GPU 0

+

GPU 1


完成实时Qwen3-TTS语音生成。


要求：

- 双GPU音质一致；
- 显存独立；
- 稳定运行；
- 支持动态调度。


---

# 二、具体提问

双T4环境应该如何设计GPU Worker架构，才能保证实时语音生成性能和稳定性？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 双独立Worker + Shared Scheduler（推荐）


架构：


Scheduler

↓

----------------

GPU0 Worker

GPU1 Worker


↓

Qwen3-TTS


↓

PCM输出


↓

Rust Runtime


---

# 五、GPU Worker设计


## GPU0 Worker


负责：

- Qwen3-TTS推理；
- CUDA Context；
- 显存管理。


---

## GPU1 Worker


负责：

- Qwen3-TTS推理；
- CUDA Context；
- 显存管理。


---

# 六、Scheduler设计


负责：

- 请求分配；
- GPU负载检测；
- 队列管理；
- Worker健康检查。


---

# 七、Voice Prompt Cache同步


两个GPU共享：

- Speaker Embedding；
- Voice Prompt Cache；
- 音色参数。


目标：

保证：

双GPU输出音色一致。


---

# 八、方案B


## 单模型跨双GPU并行


优势：

可能提高单次计算速度。


缺点：

实时流式调度复杂。


---

# 九、方案C


## GPU轮流使用


优势：

简单。


缺点：

无法充分利用双T4。


---

# 十、最终技术路线


采用：


Shared Scheduler

+

GPU0 Worker

+

GPU1 Worker


配合：

Rust Audio Runtime。


---

# 十一、验证要求


测试：


- GPU利用率；
- 显存占用；
- 推理速度；
- 双GPU音质一致性；
- Worker恢复能力。


---

# 十二、状态

QA-035完成。
