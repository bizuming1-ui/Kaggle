# QA-051

# ViiTorVoice 双T4 GPU Worker调度架构设计方案确认


## 一、问题背景

Kaggle环境提供双T4 GPU。

需要设计合理GPU分工：

GPU0

↓

TTS推理


GPU1

↓

LLM和辅助任务


目标：

最大化双GPU利用率。


---

# 二、具体提问

如何设计双T4 Worker调度系统，使LLM、Qwen3-TTS和实时播放保持稳定低延迟？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Dedicated Dual-T4 Worker Scheduler（推荐）


---

# 五、整体架构


Master Scheduler


        |


-------------------------


|                       |


GPU0 Worker        GPU1 Worker


        |


Audio Merge Queue


---

# 六、GPU0职责


负责：

- Qwen3-TTS Encoder；
- Qwen3-TTS Decoder；
- Voice Clone推理。


目标：

保证语音生成稳定。


---

# 七、GPU1职责


负责：

- DeepSeek LLM；
- 文本生成；
- 辅助任务。


目标：

避免影响TTS实时性。


---

# 八、Scheduler职责


管理：

- 请求分配；
- Worker状态；
- GPU负载；
- 任务队列。


---

# 九、优势


减少：

- GPU竞争；
- 显存碎片；
- 调度抖动。


提高：

- 稳定性；
- 可监控性；
- 优化空间。


---

# 十、方案B


GPU自动抢任务。


优势：

简单。


缺点：

可能产生：

- 负载波动；
- 音色变化；
- 延迟不稳定。


---

# 十一、方案C


单GPU运行。


优势：

简单稳定。


缺点：

无法充分利用双T4。


---

# 十二、最终技术路线


采用：

Dedicated Dual-T4 Worker Scheduler。


---

# 十三、验证要求


测试：

- GPU利用率；
- 显存占用；
- 推理速度；
- 音频一致性；
- 长时间稳定运行。


---

# 十四、状态

QA-051完成。
