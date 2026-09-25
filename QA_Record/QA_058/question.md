# QA-058

# ViiTorVoice Rust实时音频Runtime架构设计方案确认


## 一、问题背景

实时语音播放要求：

- 低延迟；
- 连续播放；
- 长时间稳定。


Python适合AI推理，

但是实时音频线程可能受到：

- GC；
- 调度；
- 解释器开销。


影响。


需要独立实时音频Runtime。


---

# 二、具体提问

如何设计Rust音频Runtime，使Qwen3-TTS生成音频能够稳定流式播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Rust Real-time Audio Engine + Ring Buffer（推荐）


---

# 五、整体架构


Python TTS Layer


↓

FFI / IPC


↓

Rust Audio Runtime


↓

Lock-free Ring Buffer


↓

WebSocket / WebRTC


↓

WebAudio


---

# 六、Rust Runtime职责


## PCM接收


负责：

接收Python生成的PCM数据。


---

## Ring Buffer


负责：

- 音频缓存；
- 连续读取；
- 防止线程阻塞。


---

## Audio Clock


负责：

保持：

播放时间准确。


---

## Buffer管理


负责：

- 水位监控；
- 动态调整。


---

## Underrun检测


负责：

提前发现：

播放不足风险。


---

## 浏览器通信


负责：

发送音频流到WebAudio。


---

# 七、与其他系统连接


结合：

Dynamic Watermark Controller。


结合：

Underrun Predictor。


结合：

Telemetry Monitor。


---

# 八、方案B


Python Audio Queue。


优势：

开发简单。


缺点：

实时稳定性较弱。


---

# 九、方案C


C++ Audio Runtime。


优势：

性能强。


缺点：

开发复杂。


---

# 十、最终技术路线


采用：

Rust Real-time Audio Engine + Ring Buffer。


---

# 十一、验证要求


测试：

- 音频延迟；
- Buffer稳定；
- underrun次数；
- 长时间播放；
- WebAudio连接。


---

# 十二、状态

QA-058完成。
