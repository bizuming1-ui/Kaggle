# QA-106

# ViiTorVoice Streaming TTS推理流水线设计方案确认


## 一、问题背景

ViiTorVoice需要实现实时语音生成。


目标：

输入文本后：

立即开始生成声音。


流程：

Text

↓

TTS

↓

PCM

↓

Audio


---

# 二、具体提问

如何设计ViiTorVoice Streaming TTS Pipeline，使文本能够低延迟转换为连续音频流？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Streaming TTS Pipeline（推荐）


---

# 五、整体架构


Text Input


↓

Normalizer


↓

Chunk Scheduler


↓

TTS Runtime


↓

Vocoder


↓

PCM Buffer


↓

Rust Audio Engine


---

# 六、Text Normalizer


负责：

文本预处理。


包括：

- 清理文本；
- 标点处理；
- 格式统一。


---

# 七、Chunk Scheduler


负责：

文本切分。


功能：

- 长文本分块；
- 优先级调度；
- 控制生成节奏。


---

# 八、TTS Runtime


负责：

实时语音生成。


支持：

- Streaming推理；
- GPU计算；
- 模型缓存。


---

# 九、Vocoder


负责：

声学特征转换：

生成：

PCM音频。


---

# 十、PCM Buffer


负责：

缓存：

连续音频数据。


避免：

播放中断。


---

# 十一、Rust Audio Engine


负责：

- 低延迟音频处理；
- Buffer管理；
- 数据传输。


---

# 十二、方案B


完整文本生成后一次合成。


优势：

实现简单。


缺点：

等待时间长。


---

# 十三、方案C


每个句子单独生成。


优势：

简单。


缺点：

上下文连续性较差。


---

# 十四、最终技术路线


采用：

Streaming TTS Pipeline。


---

# 十五、验证要求


测试：

- TTFA；
- Chunk延迟；
- 长文本连续性；
- 音频质量。


---

# 十六、状态

QA-106完成。
