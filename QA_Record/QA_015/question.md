# QA-015

# ViiTorVoice WebAudio播放器设计方案确认


## 一、问题背景

ViiTorVoice目标：

实现：

Qwen3-TTS生成声音

↓

Rust Audio Runtime处理

↓

浏览器稳定播放


要求：

- 自动播放；
- 无停顿；
- 无Gap；
- 长时间稳定。


---

# 二、具体提问

浏览器端播放PCM音频时，应该采用什么架构，才能保证实时语音连续播放？


---

# 三、方案A

## WebAudio 单 Timeline 播放架构（推荐）


架构：


Rust Runtime

↓

PCM Chunk

↓

AudioWorklet

↓

WebAudio AudioContext

↓

扬声器


核心设计：

使用单一Audio时间轴。

所有PCM按照时间戳进入播放队列。


优势：

1.

避免多个Audio对象切换。


2.

避免chunk之间产生GAP。


3.

时间同步更加准确。


4.

适合实时流式语音。


支持：

- 动态Buffer；
- 自动播放恢复；
- 长时间运行。


---

# 四、方案B

## HTML Audio多段播放


流程：

audio播放chunk1

↓

结束

↓

加载chunk2


优势：

实现简单。


缺点：

容易产生：

- 播放间隙；
- 时间漂移；
- 自动播放限制。


---

# 五、方案C

## 多Audio对象并行播放


流程：

Audio1

Audio2

Audio3


优势：

可以提前加载。


缺点：

- 时间同步困难；
- 长时间容易漂移；
- 调度复杂。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

WebAudio AudioContext + AudioWorklet + 单Timeline。


完整播放链：


Qwen3-TTS

↓

PCM

↓

Rust Runtime

↓

AudioWorklet

↓

WebAudio


---

# 八、开发要求


必须实现测试：

- 首次自动播放测试；
- PCM连续播放测试；
- GAP检测；
- 长时间播放测试。


---

# 九、验证标准


必须确认：

- 无播放中断；
- 无chunk间隔；
- 时间轴稳定；
- 浏览器恢复正常。


---

# 十、状态

QA-015完成。
