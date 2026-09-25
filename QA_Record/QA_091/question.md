# QA-091

# ViiTorVoice实时语音克隆服务API架构设计方案确认


## 一、问题背景

ViiTorVoice需要提供：

实时语音克隆服务接口。


客户端需要：

发送文本；

指定声音；

接收实时音频。


传统文件接口：

无法满足低延迟需求。


---

# 二、具体提问

如何设计ViiTorVoice实时语音克隆服务API，使客户端能够实时发送文本并接收Streaming Audio？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## WebSocket Streaming Voice API（推荐）


---

# 五、整体架构


Client


↓

WebSocket


↓

Session Manager


↓

Voice Clone Runtime


↓

Audio Stream


---

# 六、Client


负责：

发送：

- 文本；
- speaker_id；
- Session信息。


接收：

Streaming PCM。


---

# 七、WebSocket


作用：

建立：

双向实时通信。


优势：

服务器可以主动持续推送音频Chunk。


---

# 八、Session Manager


负责：

管理：

- 用户Session；
- Speaker状态；
- Audio状态。


---

# 九、Voice Clone Runtime


负责：

执行：

- Speaker Embedding加载；
- TTS推理；
- Streaming生成。


---

# 十、Audio Stream


输出：

连续PCM Chunk。


例如：

Audio Chunk 1

↓

Audio Chunk 2

↓

Audio Chunk 3


---

# 十一、API输入


文本：

{
"text":"你好"
}


声音：

{
"speaker_id":"user_voice_001"
}


---

# 十二、API输出


Streaming Audio：

PCM Chunk。


---

# 十三、方案B


HTTP请求返回完整音频文件。


优势：

简单。


缺点：

延迟高。

不适合实时。


---

# 十四、方案C


本地函数调用。


优势：

简单。


缺点：

无法服务化。


---

# 十五、最终技术路线


采用：

WebSocket Streaming Voice API。


---

# 十六、验证要求


测试：

- Streaming稳定性；
- 多Session；
- 延迟；
- 断线恢复。


---

# 十七、状态

QA-091完成。
