# QA-085

# ViiTorVoice TTS流式生成架构设计方案确认


## 一、问题背景

传统TTS流程：

完整文本输入

↓

等待全部音频生成

↓

开始播放


存在：

- 首音频延迟高；
- 实时交互差。


需要实现实时Streaming TTS。


---

# 二、具体提问

ViiTorVoice实时语音克隆是否采用真正Streaming TTS，实现文本输入后立即生成PCM并播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Streaming TTS实时生成架构（推荐）


---

# 五、整体流程


Text Input


↓

Text Chunker


↓

Streaming TTS


↓

PCM Chunk


↓

Audio Buffer


↓

Immediate Playback


---

# 六、Text Chunker


作用：

将输入文本分割。


例如：

长文本


↓

短语音片段


↓

连续生成。


---

# 七、Streaming TTS


特点：

不是等待完整文本。


而是：

输入一部分文本；

生成对应音频。


---

# 八、PCM Chunk


生成：

小块PCM数据。


传输：

Audio Pipeline。


---

# 九、Audio Buffer


负责：

- 缓冲；
- 排队；
- 防止播放中断。


---

# 十、Immediate Playback


实现：

生成一点；

播放一点。


降低：

等待时间。


---

# 十一、性能目标


优化：

- TTFA；
- 端到端延迟；
- 连续播放。


---

# 十二、方案B


完整文本生成后播放。


优势：

简单。


缺点：

延迟高。


---

# 十三、方案C


固定句子切片生成。


优势：

实现容易。


缺点：

实时性低于Streaming。


---

# 十四、最终技术路线


采用：

Streaming TTS实时生成架构。


---

# 十五、验证要求


测试：

- 首音频时间；
- PCM连续性；
- 播放稳定性；
- 长文本生成。


---

# 十六、状态

QA-085完成。
