# QA-033

# ViiTorVoice Rust实时音频Runtime设计方案确认


## 一、问题背景

ViiTorVoice需要：

Qwen3-TTS生成PCM。


然后：

PCM

↓

实时传输

↓

浏览器播放。


要求：

- 低延迟；
- 无停顿；
- 长时间运行稳定；
- 支持动态Buffer；
- 支持underrun预测。


---

# 二、具体提问

实时音频Runtime应该使用什么技术架构，才能保证高性能和稳定性？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Rust Async Runtime + Lock-Free Ring Buffer（推荐）


整体流程：


Qwen3-TTS Worker

↓

Rust Async Channel

↓

Lock-Free Ring Buffer

↓

Watermark Controller

↓

WebAudio


---

# 五、核心组件


## Tokio Async Runtime


作用：

处理：

- 异步任务；
- 网络通信；
- Worker管理。


---

## Crossbeam Queue


作用：

提供：

高性能并发队列。


---

## Lock-Free Ring Buffer


作用：

保存PCM数据。


优势：

- 减少锁竞争；
- 降低延迟。


---

## Zero-Copy PCM


目标：

减少：

内存复制。


提高：

实时性能。


---

# 六、方案B


## Python Queue


优势：

开发简单。


缺点：

- GIL限制；
- 延迟波动；
- 长时间稳定性不足。


---

# 七、方案C


## Rust Mutex Queue


优势：

容易实现。


缺点：

高频音频数据可能产生锁竞争。


---

# 八、最终技术路线


采用：

Rust实时音频Runtime。


结合：


TTS Worker

↓

Rust Buffer

↓

Dynamic Watermark

↓

AudioWorklet


---

# 九、验证要求


测试：


- Buffer稳定性；
- 延迟；
- CPU占用；
- 长时间播放；
- 无内存泄漏。


---

# 十、状态

QA-033完成。
