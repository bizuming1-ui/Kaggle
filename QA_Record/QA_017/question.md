# QA-017

# ViiTorVoice 双T4 GPU任务分配架构确认


## 一、问题背景

ViiTorVoice部署环境：

Kaggle 双 NVIDIA T4 GPU。


目标：

充分利用双T4资源，同时保证：

- TTS音质稳定；
- 实时流式生成；
- 连续播放；
- 长时间运行。


---

# 二、具体提问

双T4环境下，LLM、TTS和调度系统应该如何分配GPU任务，才能获得最佳实时性能？


---

# 三、方案A

## 角色固定绑定 + Scheduler调度（推荐）


架构：


GPU0

↓

Qwen3-TTS-1.7B Worker


负责：

- Voice Clone推理；
- Speaker Embedding；
- PCM生成。



GPU1

↓

DeepSeek LLM

↓

Segmenter

↓

Scheduler


负责：

- 流式文本生成；
- 文本切片；
- TTS请求管理；
- 系统调度。


Scheduler控制：

- TTS优先级；
- Buffer状态；
- 动态水位；
- 任务顺序。


优势：

1.

GPU职责明确。

2.

减少模型迁移。

3.

降低调度复杂度。

4.

保持音质一致。


---

# 四、方案B

## 动态迁移模型


根据GPU负载：

移动LLM或TTS模型。


优势：

理论利用率提高。


缺点：

- 模型迁移耗时；
- 实时性风险增加；
- 系统复杂。


---

# 五、方案C

## 两个GPU共享全部任务


GPU0：

LLM/TTS


GPU1：

LLM/TTS


优势：

吞吐量可能提高。


缺点：

- 音色一致性难保证；
- 调度复杂；
- Debug困难。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

固定GPU角色。


完整架构：

GPU1:

DeepSeek

↓

Segmenter

↓

Scheduler


GPU0:

Qwen3-TTS

↓

PCM


↓

Rust Runtime

↓

WebAudio


---

# 八、开发要求


必须增加：

- GPU任务监控；
- 显存监控；
- GPU利用率监控；
- Scheduler日志。


---

# 九、验证标准


必须确认：

- 双T4正常工作；
- TTS不中断；
- LLM不影响播放；
- 长时间运行稳定。


---

# 十、状态

QA-017完成。
