# QA-019

# ViiTorVoice LLM到TTS Segmenter设计方案确认


## 一、问题背景

ViiTorVoice流程：

DeepSeek流式生成文本

↓

文本切片

↓

Qwen3-TTS-1.7B生成声音


文本切片直接影响：

- 首音频速度；
- 语音自然度；
- 韵律；
- 停顿。


---

# 二、具体提问

DeepSeek Streaming输出文本后，应该采用什么Segmenter策略发送给TTS，才能兼顾实时性和自然语音？


---

# 三、方案A

## 语义感知 Segmenter（推荐）


流程：


DeepSeek Streaming

↓

语义分析

↓

Segmenter判断：

- 标点；
- 句子完整性；
- 语义边界；
- 文本长度；
- 自然停顿。


↓

生成TTS Segment


↓

Qwen3-TTS生成。


优势：

1.

保持完整语义。

2.

提升韵律自然度。

3.

减少机械断句。

4.

降低首音频等待。


---

# 四、方案B

## 固定字符长度切片


例如：

每200字发送一次。


优势：

简单。


缺点：

可能：

- 切断句子；
- 影响语气；
- 破坏自然停顿。


---

# 五、方案C

## Token数量固定切片


例如：

每100 Token发送一次。


优势：

实现简单。


缺点：

- 不理解语言结构；
- 可能造成不自然停顿。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

语义感知Segmenter。


结合：

DeepSeek Streaming

↓

Semantic Segmenter

↓

Qwen3-TTS Worker

↓

PCM Buffer


---

# 八、开发要求


必须测试：

- Segment长度；
- 首音频时间；
- 语音自然度；
- 长文本连续性。


---

# 九、验证标准


必须确认：

- 不切断语义；
- 首响应速度满足要求；
- 韵律自然；
- 连续播放稳定。


---

# 十、状态

QA-019完成。
