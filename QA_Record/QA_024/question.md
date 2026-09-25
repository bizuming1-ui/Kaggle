# QA-024

# ViiTorVoice TypeScript WebAudio播放器架构方案确认


## 一、问题背景

ViiTorVoice需要实现：


Rust Runtime

↓

PCM实时数据

↓

浏览器播放


要求：

- 自动播放；
- 无GAP；
- 无停顿；
- 支持动态Buffer；
- 长时间运行稳定。


---

# 二、具体提问

浏览器端实时播放PCM流，应该采用什么WebAudio架构，才能满足低延迟和连续播放要求？


---

# 三、方案A

## AudioWorklet + SharedArrayBuffer + WebAudio Timeline（推荐）


完整流程：


Rust Runtime

↓

WebSocket/WebRTC/DataChannel

↓

SharedArrayBuffer

↓

AudioWorklet Processor

↓

AudioContext Timeline

↓

Speaker


---

# 四、核心设计


## 1. AudioWorklet


负责：

实时PCM处理。


优势：

- 独立线程；
- 不受主线程UI影响；
- 适合实时音频。


---

## 2. SharedArrayBuffer


作用：

Rust和浏览器之间共享音频数据。


优势：

- 减少复制；
- 降低延迟；
- 提高吞吐。


---

## 3. WebAudio Timeline


保证：

所有声音按照统一时间轴播放。


避免：

- chunk切换间隔；
- 时间漂移。


---

# 五、方案B

## AudioBufferSourceNode


流程：

PCM

↓

AudioBuffer

↓

播放


优势：

简单。


缺点：

- 对象创建频繁；
- 长时间容易漂移；
- 不适合实时流。


---

# 六、方案C

## HTML5 Audio标签


优势：

实现简单。


缺点：

- PCM控制能力弱；
- 延迟较高；
- 不适合实时语音。


---

# 七、用户选择

选择：

A


---

# 八、最终技术路线


采用：

AudioWorklet + SharedArrayBuffer。


结合：


Rust Runtime

↓

Shared Memory Buffer

↓

AudioWorklet

↓

WebAudio Timeline


---

# 九、开发要求


必须测试：

- 自动播放；
- AudioContext恢复；
- 长时间播放；
- PCM连续性；
- GAP检测。


---

# 十、验证标准


必须确认：

- 无播放中断；
- 无明显延迟；
- 无chunk间隙；
- CPU稳定。


---

# 十一、状态

QA-024完成。
