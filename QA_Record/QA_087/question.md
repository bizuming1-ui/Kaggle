# QA-087

# ViiTorVoice双T4 GPU实时推理流水线设计方案确认


## 一、问题背景

ViiTorVoice实时语音克隆包含：

- LLM文本生成；
- Voice Encoder；
- TTS推理；
- Audio Streaming。


如果所有任务运行在同一个GPU：

会导致：

- GPU竞争；
- 延迟增加；
- 实时性下降。


需要设计双GPU并行架构。


---

# 二、具体提问

如何利用Kaggle双T4 GPU，使LLM和TTS语音克隆流水线并行运行？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 双T4 GPU流水线并行架构（推荐）


---

# 五、整体架构


GPU1


↓

LLM Worker


↓

Text Chunk Queue


↓

GPU0


↓

TTS Worker


↓

Audio Stream


---

# 六、GPU0职责


负责：

## Voice Encoder


处理：

用户声音特征。


---

## TTS Inference


处理：

文本到语音。


---

## Voice Clone


生成：

目标声音。


---

# 七、GPU1职责


负责：

## LLM


生成：

回复文本。


---

## Text Processing


执行：

- 分句；
- Chunk切分；
- 调度。


---

# 八、并行流程


用户输入


↓

GPU1生成文本


↓

Text Chunk进入队列


↓

GPU0立即生成语音


↓

Streaming Audio播放


---

# 九、性能优势


提高：

- GPU利用率；
- 并发能力；
- 实时响应。


降低：

- TTFA；
- 等待时间。


---

# 十、方案B


所有模型放GPU0。


优势：

简单。


缺点：

资源竞争。


---

# 十一、方案C


GPU动态切换模型。


优势：

资源灵活。


缺点：

模型移动导致延迟。


---

# 十二、最终技术路线


采用：

双T4 GPU流水线并行架构。


---

# 十三、验证要求


测试：

- GPU利用率；
- TTFA；
- 并行稳定性；
- 长时间运行。


---

# 十四、状态

QA-087完成。
