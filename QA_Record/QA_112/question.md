# QA-112

# ViiTorVoice WebAudio实时播放架构设计方案确认


## 一、问题背景

ViiTorVoice需要浏览器端实时播放Streaming PCM。


播放链路：

WebSocket

↓

Audio Queue

↓

WebAudio

↓

Speaker


---

# 二、具体提问

如何设计浏览器端音频播放系统，实现低延迟、连续播放和稳定同步？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## WebAudio Timeline + AudioWorklet


---

# 五、整体架构


WebSocket


↓

Audio Queue


↓

AudioWorklet


↓

WebAudio Timeline


↓

Speaker Output


---

# 六、Audio Queue


负责：

缓存PCM Chunk。


作用：

防止：

- 网络抖动；
- 播放中断。


---

# 七、AudioWorklet


负责：

实时音频处理。


优势：

- 独立音频线程；
- 低延迟。


---

# 八、WebAudio Timeline


负责：

时间同步。


保证：

连续播放。


---

# 九、浏览器限制处理


包括：

- Autoplay解锁；
- AudioContext恢复；
- 播放状态监控。


---

# 十、方案B


HTML Audio标签。


优势：

简单。


缺点：

控制能力弱。


---

# 十一、方案C


MediaSource。


优势：

适合媒体。


缺点：

实时PCM控制不足。


---

# 十二、最终技术路线


采用：

WebAudio Timeline + AudioWorklet。


---

# 十三、验证要求


测试：

- 长时间播放；
- 网络抖动；
- 自动恢复；
- 延迟。


---

# 十四、状态

QA-112完成。
