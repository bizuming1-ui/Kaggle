# QA-037

# ViiTorVoice WebAudio实时播放架构设计方案确认


## 一、问题背景

实时语音系统需要：

Rust Runtime

↓

PCM Chunk

↓

浏览器

↓

WebAudio


实现：

一边生成

一边播放。


要求：

- 自动播放；
- 无明显GAP；
- 动态Buffer；
- 长时间稳定。


---

# 二、具体提问

浏览器端实时播放AI克隆语音应该采用什么架构，才能降低延迟并保持连续播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## AudioWorklet + SharedArrayBuffer + Ring Buffer（推荐）


---

# 五、整体流程


Rust Runtime

↓

WebSocket/WebRTC

↓

SharedArrayBuffer

↓

AudioWorklet

↓

WebAudio Output


---

# 六、核心组件


## AudioWorklet


作用：

运行独立音频线程。


优势：

避免：

主线程阻塞。


---

## SharedArrayBuffer


作用：

共享PCM数据。


优势：

减少：

内存复制。


---

## Ring Buffer


作用：

连续保存音频Chunk。


支持：

动态水位控制。


---

# 七、自动播放设计


实现：

- 用户首次手势解锁；
- AudioContext恢复；
- 后续自动连续播放。


---

# 八、方案B


## HTML Audio播放Blob


优势：

简单。


缺点：

- 延迟高；
- 不适合流式。


---

# 九、方案C


## JavaScript setInterval播放PCM


优势：

开发简单。


缺点：

计时不稳定。


---

# 十、最终技术路线


采用：


AudioWorklet

+

SharedArrayBuffer

+

Ring Buffer


配合：

Rust Audio Runtime。


---

# 十一、验证要求


测试：


- 播放延迟；
- Buffer水位；
- GAP次数；
- CPU占用；
- 长时间播放稳定性。


---

# 十二、状态

QA-037完成。
