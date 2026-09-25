# QA-021

# ViiTorVoice Rust实时音频Runtime设计方案确认


## 一、问题背景

ViiTorVoice需要实现：

Qwen3-TTS连续生成声音

同时：

实时播放克隆语音。


要求：

- 无停顿；
- 无GAP；
- 动态Buffer控制；
- 降低CPU调度开销；
- 长时间稳定运行。


---

# 二、具体提问

实时音频播放Runtime应该使用什么技术架构，才能保证低延迟和稳定连续播放？


---

# 三、方案A

## Rust Lock-Free Ring Buffer Runtime（推荐）


完整流程：


Qwen3-TTS Worker

↓

PCM Producer

↓

Rust Lock-Free Ring Buffer

↓

Audio Consumer

↓

WebAudio


---

# 四、核心设计


## 1. Lock-Free Ring Buffer


作用：

保存实时PCM数据。


优势：

- 减少线程锁等待；
- 降低延迟；
- 提高吞吐。


---

## 2. 原子状态控制


监控：

- buffer长度；
- 写入位置；
- 读取位置。


---

## 3. 动态水位控制


根据：

- 生成速度；
- 播放速度；
- buffer变化。


动态调整：

预缓存量。


避免：

buffer过低导致断音。


---

## 4. Underrun Predictor


提前预测：

播放缓冲是否不足。


提前：

增加生成压力。


避免：

播放中断。


---

# 五、方案B

## Python Queue Runtime


流程：

Python TTS

↓

queue.Queue

↓

播放器


优势：

简单。


缺点：

- Python GIL影响；
- 高并发能力有限；
- 实时控制较弱。


---

# 六、方案C

## Go Channel Runtime


流程：

TTS

↓

Go Channel

↓

Player


优势：

开发方便。


缺点：

实时音频控制能力不如Rust。


---

# 七、用户选择

选择：

A


---

# 八、最终技术路线


采用：

Rust Lock-Free Ring Buffer。


结合：


Python：

TTS AI层


Rust：

实时PCM Runtime


TypeScript：

WebAudio播放器


---

# 九、开发要求


必须实现监测：

- PCM吞吐速度；
- Buffer水位；
- underrun次数；
- CPU占用；
- 长时间运行状态。


---

# 十、验证标准


必须确认：

- 连续播放无中断；
- 无明显GAP；
- CPU稳定；
- 长时间运行可靠。


---

# 十一、状态

QA-021完成。
