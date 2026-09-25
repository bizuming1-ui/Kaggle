# QA-092

# ViiTorVoice前端实时播放架构设计方案确认


## 一、问题背景

ViiTorVoice后端输出：

Streaming PCM Chunk。


客户端需要：

实时接收；

实时播放。


不能：

等待完整音频后播放。


---

# 二、具体提问

如何设计浏览器端实时播放系统，使WebSocket传输的PCM音频能够低延迟、连续播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## WebAudio Timeline实时播放（推荐）


---

# 五、整体架构


WebSocket


↓

PCM Queue


↓

AudioWorklet


↓

WebAudio Scheduler


↓

Speaker


---

# 六、WebSocket


负责：

接收：

Streaming PCM。


数据形式：

Audio Chunk。


---

# 七、PCM Queue


负责：

缓存：

连续音频数据。


避免：

网络抖动影响播放。


---

# 八、AudioWorklet


作用：

浏览器低延迟音频处理。


优势：

独立音频线程。


---

# 九、WebAudio Scheduler


负责：

精确控制：

播放时间。


保证：

- 连续；
- 同步；
- 无GAP。


---

# 十、Speaker


输出：

最终声音。


---

# 十一、方案B


HTML Audio播放Blob。


优势：

简单。


缺点：

- 延迟高；
- 控制能力弱。


---

# 十二、方案C


收到Chunk立即播放。


优势：

实现简单。


缺点：

容易：

- 卡顿；
- 音频断裂。


---

# 十三、最终技术路线


采用：

WebAudio Timeline实时播放。


---

# 十四、验证要求


测试：

- 播放延迟；
- GAP数量；
- 长时间播放；
- 浏览器兼容性。


---

# 十五、状态

QA-092完成。
