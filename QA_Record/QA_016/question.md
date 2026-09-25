# QA-016

# ViiTorVoice Voice Clone Prompt Cache设计方案确认


## 一、问题背景

ViiTorVoice需要实现：

高质量声音克隆

并且优化：

LLM

↓

TTS请求

↓

首音频响应时间。


当前流程：

参考音频

↓

Speaker Encoder

↓

音色特征

↓

Qwen3-TTS生成


如果每一次请求都重新计算参考音频特征，会导致：

- 延迟增加；
- GPU重复计算；
- 首音频响应变慢。


---

# 二、具体提问

Voice Clone参考音频特征应该采用什么缓存方案，才能提高速度并保持音色稳定？


---

# 三、方案A

## 持久化 Voice Clone Prompt Cache（推荐）


首次处理：

参考音频

↓

Speaker Encoder

↓

Speaker Embedding

↓

Voice Prompt Cache

↓

保存Dataset


后续请求：

文本输入

↓

读取Cache

↓

Qwen3-TTS-1.7B生成


缓存结构：

cache/

├── speaker_embedding.pt

├── voice_prompt.json

└── metadata.json


优势：

1.

避免重复计算。

2.

降低首TTS延迟。

3.

保持声音特征一致。

4.

Kaggle重启后可以恢复。


---

# 四、方案B

## 每次重新计算参考音频


优势：

实现简单。


缺点：

- 每次增加延迟；
- GPU资源浪费；
- 不利于实时系统。


---

# 五、方案C

## 只保存内存Cache


优势：

运行期间速度快。


缺点：

- Kaggle重启丢失；
- 无法长期恢复。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

持久化 Voice Clone Prompt Cache。


结合：

Kaggle Dataset固化恢复。


流程：

Reference Audio

↓

Speaker Embedding

↓

Prompt Cache

↓

Qwen3-TTS Worker


---

# 八、开发要求


必须实现测试：

- Cache读取速度；
- Cache一致性；
- 首TTS延迟变化；
- 音色稳定测试。


---

# 九、验证标准


必须确认：

- 重启后Cache可恢复；
- 同一参考音频生成结果稳定；
- 首音频时间降低。


---

# 十、状态

QA-016完成。
