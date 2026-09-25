# QA-046

# ViiTorVoice TypeScript WebAudio播放器设计方案确认


## 一、问题背景

实时语音播放链路：

Rust Runtime

↓

Browser

↓

WebAudio API

↓

Speaker


需要实现：

- 自动播放；
- 低延迟；
- 连续播放；
- 动态Buffer；
- 重连。


---

# 二、具体提问

如何设计浏览器端实时音频播放器，使Qwen3-TTS生成语音能够连续稳定播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## AudioWorklet + WebAudio Single Timeline（推荐）


---

# 五、整体架构


Audio Stream


↓

WebSocket/WebRTC


↓

AudioWorklet


↓

SharedArrayBuffer


↓

WebAudio Timeline


↓

Speaker


---

# 六、AudioWorklet作用


负责：

- 音频处理；
- 实时播放；
- 避免主线程阻塞。


---

# 七、SharedArrayBuffer作用


负责：

- 高性能数据共享；
- 减少复制；
- 提高稳定性。


---

# 八、Single Timeline设计


目标：

所有音频按照统一时间轴播放。


避免：

- GAP；
- 重复播放；
- 时间漂移。


---

# 九、自动播放设计


支持：

- 用户首次授权；
- AudioContext恢复；
- clone play重试。


---

# 十、方案B


## 普通Audio元素


优势：

简单。


缺点：

- 延迟较高；
- 控制能力弱。


---

# 十一、方案C


## 定时拼接AudioBuffer


优势：

容易实现。


缺点：

容易出现：

- GAP；
- 调度抖动。


---

# 十二、最终技术路线


采用：

AudioWorklet

+

WebAudio Single Timeline。


---

# 十三、验证要求


测试：

- 自动播放；
- 连续播放；
- 延迟；
- GAP次数；
- 长时间稳定性。


---

# 十四、状态

QA-046完成。
