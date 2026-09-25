# QA-062

# ViiTorVoice LLM到TTS流式文本切分优化方案确认


## 一、问题背景

传统流程：

LLM输出完整文本

↓

TTS生成

↓

播放


导致：

- 首音频延迟增加；
- 用户等待时间增加。


需要实现：

LLM流式输出同时进入TTS。


---

# 二、具体提问

如何设计LLM到Qwen3-TTS之间的智能文本切分系统，实现低延迟流式语音生成？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Semantic Streaming Segmenter（推荐）


---

# 五、整体架构


LLM Token Stream


↓

Semantic Analyzer


↓

Prosody-aware Segmenter


↓

TTS Queue


↓

Qwen3-TTS


↓

Audio Output


---

# 六、Semantic Analyzer


分析：

- 语义完整度；
- 句子结构；
- 上下文。


---

# 七、Segmenter规则


判断：

## 标点边界


例如：

- 句号；
- 问号；
- 感叹号。


---

## 语义边界


避免：

强行切断完整意思。


---

## 韵律边界


配合：

停顿；
重音；
呼吸。


---

# 八、TTS Queue


负责：

缓存：

- 待生成文本；
- 优先级；
- 顺序。


---

# 九、优势


降低：

TTFA。


提高：

- 流畅性；
- 连续播放；
- 真人感。


---

# 十、方案B


固定字符长度切分。


优势：

简单。


缺点：

容易：

- 语义断裂；
- 韵律异常。


---

# 十一、方案C


等待完整句子。


优势：

质量稳定。


缺点：

延迟最高。


---

# 十二、最终技术路线


采用：

Semantic Streaming Segmenter。


---

# 十三、验证要求


测试：

- TTFA；
- 分段质量；
- TTS连续性；
- 韵律自然度。


---

# 十四、状态

QA-062完成。
