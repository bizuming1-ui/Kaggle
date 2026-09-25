# QA-014

# ViiTorVoice Python TTS 与 Rust Audio Runtime 通信方案确认


## 一、问题背景

ViiTorVoice系统需要实现：

Qwen3-TTS-1.7B实时生成声音

↓

PCM数据传输

↓

Rust实时音频Runtime

↓

WebAudio播放


要求：

- 极低延迟；
- 连续播放；
- 无卡顿；
- 支持动态水位控制。


---

# 二、具体提问

Python TTS层生成PCM以后，应该使用什么方式传输给Rust Audio Runtime，才能达到最高性能和稳定性？


---

# 三、方案A

## Shared Memory + Ring Buffer（推荐）


架构：


Python TTS

↓

共享内存 Shared Memory

↓

Rust Ring Buffer

↓

Rust Audio Thread

↓

WebAudio


Python负责：

- Qwen3-TTS推理；
- PCM生成；
- 写入共享内存。


Rust负责：

- 实时读取PCM；
- Ring Buffer管理；
- 音频线程调度；
- 动态水位控制；
- underrun predictor。


技术特点：

- 减少数据复制；
- 降低通信延迟；
- 避免网络协议开销；
- 适合实时音频。


优势：

1.

性能最高。

2.

适合长时间运行。

3.

方便实现动态Buffer。


---

# 四、方案B

## TCP/WebSocket通信


架构：

Python

↓

Socket

↓

Rust


优势：

实现简单。


缺点：

- 网络协议开销；
- 延迟增加；
- 稳定性受影响。


---

# 五、方案C

## Python调用Rust动态库


架构：

Python

↓

PyO3

↓

Rust Library


优势：

调用方便。


缺点：

- Python线程影响实时性；
- 实时音频隔离不足。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

Shared Memory + Rust Ring Buffer。


系统结构：

Qwen3-TTS

↓

PCM Shared Memory

↓

Rust Runtime

↓

Dynamic Watermark Controller

↓

WebAudio


---

# 八、开发要求


必须实现测试：

- PCM传输延迟测试；
- Ring Buffer压力测试；
- Buffer稳定性测试；
- 长时间播放测试。


---

# 九、验证标准


必须确认：

- 无PCM丢失；
- 无数据损坏；
- 无播放中断；
- CPU占用稳定。


---

# 十、状态

QA-014完成。
