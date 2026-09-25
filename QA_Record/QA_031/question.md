# QA-031

# ViiTorVoice LLM到首个TTS音频响应优化方案确认


## 一、问题背景

实时语音系统最大用户感知延迟来自：

输入文字

↓

LLM生成

↓

文本处理

↓

TTS初始化

↓

首个音频产生。


需要降低：

TTFT

(Time To First Token)


TTFA

(Time To First Audio)


---

# 二、具体提问

如何优化LLM到第一个TTS音频输出的时间，使用户最快听到克隆语音？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Pipeline Streaming + Warmup + Parallel Prefetch（推荐）


流程：


用户输入

↓

DeepSeek Streaming

↓

实时Segment

↓

TTS Worker

↓

首Segment生成

↓

Audio Buffer

↓

播放


---

# 五、关键优化


## 1. 模型Warmup


启动阶段提前：

- 加载模型；
- 初始化CUDA；
- 创建Worker。


避免第一次请求等待。


---

## 2. Voice Cache提前加载


启动时加载：

- Speaker Embedding；
- Voice Prompt Cache。


减少首次克隆处理。


---

## 3. LLM与TTS并行


不要等待：

完整LLM输出。


改为：

LLM输出一部分

↓

立即Segment

↓

立即TTS。


---

## 4. 首Segment优先


第一段文本：

最高调度优先级。


目标：

快速产生第一段音频。


---

# 六、方案B


等待LLM完整输出。


优势：

实现简单。


缺点：

首音频延迟高。


---

# 七、方案C


只优化TTS推理。


优势：

提升TTS速度。


缺点：

无法降低LLM等待。


---

# 八、最终技术路线


采用：

Streaming Pipeline。


结合：


LLM Streaming

↓

Segmenter

↓

TTS Worker

↓

Rust Buffer

↓

WebAudio


---

# 九、验证要求


测试：

- TTFT；
- TTFA；
- 首音频时间；
- GPU启动时间；
- Cache加载时间。


---

# 十、状态

QA-031完成。
