# QA-022

# ViiTorVoice动态水位控制方案确认


## 一、问题背景

ViiTorVoice要求：

Qwen3-TTS持续生成PCM。

同时：

播放器持续消费PCM。


系统不能出现：

生成

↓

停止

↓

生成

↓

停止


这种调度抖动。


---

# 二、具体提问

实时语音系统应该采用什么Buffer控制算法，才能保证生成和播放长期稳定？


---

# 三、方案A

## PID + Predictive Buffer Controller（推荐）


控制流程：


Buffer当前水位

↓

预测未来消耗速度

↓

PID控制器

↓

调整TTS生成节奏


---

# 四、核心参数


监控：

## Buffer Level

当前PCM缓存量。


## Generation Latency

TTS生成延迟。


## Playback Latency

播放消耗速度。


## Underrun Risk

预测断音风险。


---

# 五、优势


1.

动态调整缓存。


2.

减少播放停顿。


3.

避免频繁启动停止。


4.

适合实时语音。


---

# 六、方案B

## 固定Buffer大小


例如：

固定缓存5秒音频。


优势：

简单。


缺点：

- 延迟固定；
- 无法适应速度变化。


---

# 七、方案C

## 阈值规则控制


规则：

Buffer低于2秒：

启动生成。


Buffer高于5秒：

停止生成。


优势：

简单。


缺点：

容易产生：

生成→停止→生成。


---

# 八、用户选择

选择：

A


---

# 九、最终技术路线


采用：

PID + Predictive Buffer Controller。


结合：

Rust Ring Buffer

↓

Dynamic Watermark Controller

↓

Qwen3-TTS Worker


---

# 十、开发要求


必须实现：

- Buffer监控；
- PID参数记录；
- underrun预测；
- 调度日志。


---

# 十一、验证标准


必须确认：

- 长时间播放无断音；
- Buffer稳定；
- CPU占用稳定；
- 无生成停止循环。


---

# 十二、状态

QA-022完成。
