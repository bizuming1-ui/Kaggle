# QA-111

# ViiTorVoice WebSocket Streaming通信协议设计方案确认


## 一、问题背景

ViiTorVoice需要：

Rust Audio Engine

↓

WebSocket

↓

Browser WebAudio


实现实时音频传输。


---

# 二、具体提问

如何设计ViiTorVoice WebSocket通信协议，使PCM音频能够低延迟、稳定传输，并支持断线恢复？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Binary WebSocket Streaming Protocol


---

# 五、整体架构


Rust Audio Engine


↓

WebSocket Server


↓

Browser WebAudio


---

# 六、数据传输方式


采用：

Binary Frame。


传输：

PCM Audio Chunk。


---

# 七、协议字段


包括：


Sequence ID


作用：

保证Chunk顺序。


---

Timestamp


作用：

同步播放。


---

Heartbeat


作用：

检测连接状态。


---

Reconnect


作用：

网络异常恢复。


---

Playback ACK


作用：

确认播放进度。


---

# 八、优势


实现：

- 低延迟；
- 高吞吐；
- 稳定Streaming；
- 支持实时播放。


---

# 九、方案B


HTTP轮询。


缺点：

延迟高。


---

# 十、方案C


JSON WebSocket。


优势：

开发简单。


缺点：

音频传输效率低。


---

# 十一、最终技术路线


采用：

Binary WebSocket Streaming Protocol。


---

# 十二、验证要求


测试：

- 连续播放；
- 网络断开恢复；
- Chunk顺序；
- 长时间运行。


---

# 十三、状态

QA-111完成。
