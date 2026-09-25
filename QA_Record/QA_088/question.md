# QA-088

# ViiTorVoice端到端低延迟优化策略设计方案确认


## 一、问题背景

实时语音克隆完整链路：

用户输入

↓

LLM生成

↓

TTS生成

↓

Audio播放


任何阶段等待都会增加延迟。


需要建立全链路Streaming优化。


---

# 二、具体提问

如何优化ViiTorVoice端到端延迟，使用户输入后快速听到克隆语音？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 全链路Streaming低延迟架构（推荐）


---

# 五、整体流程


Token Streaming


↓

Text Chunk Streaming


↓

TTS Streaming


↓

PCM Streaming


↓

WebAudio Timeline


---

# 六、LLM优化


采用：

Streaming Token。


效果：

生成一个Token即可继续处理。


减少：

等待完整回复。


---

# 七、Text Chunk Streaming


功能：

快速分句。


例如：

完整文本：

↓

短语音片段


立即发送TTS。


---

# 八、TTS优化


包括：

## Chunk生成


小段音频持续生成。


---

## KV Cache


减少：

重复计算。


---

## FP16/BF16


提升：

GPU推理速度。


---

# 九、Audio优化


包括：

- Buffer大小调整；
- Timeline调度；
- PCM连续播放。


---

# 十、端到端目标


用户输入


↓

快速处理


↓

开始播放声音


目标：

低于传统完整生成流程。


---

# 十一、方案B


只优化TTS。


优势：

实现简单。


缺点：

LLM仍然限制速度。


---

# 十二、方案C


增加GPU数量。


优势：

增加计算资源。


缺点：

不能解决流水线等待问题。


---

# 十三、最终技术路线


采用：

全链路Streaming低延迟优化方案。


---

# 十四、验证要求


测试：

- TTFA；
- End-to-End Latency；
- GAP；
- GPU利用率。


---

# 十五、状态

QA-088完成。
