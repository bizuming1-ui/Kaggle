# QA-047

# ViiTorVoice LLM到TTS流式文本规划方案确认


## 一、问题背景

传统流程：

LLM完整生成

↓

TTS生成

↓

播放


导致：

首音频等待时间过长。


需要实现：

LLM流式输出过程中，同时准备TTS。


---

# 二、具体提问

如何设计LLM Streaming到Qwen3-TTS之间的文本分段系统，使首音频快速响应，同时保持自然语音？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Predictive Streaming Segmenter（推荐）


---

# 五、整体流程


DeepSeek LLM


↓

Streaming Token


↓

Token Buffer


↓

语义预测


↓

Segment生成


↓

Qwen3-TTS


↓

Rust Runtime


↓

实时播放


---

# 六、Segmenter职责


判断：

- 标点；
- 语义边界；
- 句子长度；
- 停顿位置。


---

# 七、预测能力


根据当前Token：

预测：

未来文本结构。


提前：

准备TTS任务。


---

# 八、优势


降低：

TTFA。


保持：

- 语义完整；
- 自然停顿；
- 呼吸感。


---

# 九、方案B


固定字符长度切割。


优势：

简单。


缺点：

容易：

- 断句；
- 不自然。


---

# 十、方案C


等待完整LLM输出。


优势：

实现简单。


缺点：

首音频延迟最大。


---

# 十一、最终技术路线


采用：

Predictive Streaming Segmenter。


实现：

LLM和TTS并行流水线。


---

# 十二、验证要求


测试：

- TTFT；
- TTFA；
- Segment质量；
- 断句情况；
- 播放连续性。


---

# 十三、状态

QA-047完成。
