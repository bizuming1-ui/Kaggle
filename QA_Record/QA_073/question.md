# QA-073

# ViiTorVoice多设备访问与远程控制架构设计方案确认


## 一、问题背景

ViiTorVoice未来需要支持：

- Windows电脑访问；
- 手机浏览器访问；
- 远程语音交互。


如果直接暴露核心服务：

会导致：

- 安全问题；
- 会话管理困难；
- 扩展困难。


需要建立访问网关。


---

# 二、具体提问

如何设计ViiTorVoice远程访问架构，使多个设备能够安全实时连接GPU服务器？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Distributed Voice Access Gateway（推荐）


---

# 五、整体架构


Client


↓

Web Gateway


↓

Session Manager


↓

Voice Engine


↓

GPU Workers


---

# 六、Client层


支持：

- Windows；
- 手机；
- 浏览器。


负责：

- 输入；
- 音频播放；
- 用户交互。


---

# 七、Web Gateway


负责：

- HTTP API；
- WebSocket；
- 请求转发。


---

# 八、Session Manager


管理：

- 用户Session；
- 状态保存；
- 断线恢复。


---

# 九、Voice Engine


连接：

- LLM；
- TTS；
- Audio Runtime。


---

# 十、GPU Workers


负责：

- 模型推理；
- 音频生成。


---

# 十一、实时通信


采用：

WebSocket。


支持：

- 流式文本；
- 流式音频；
- 状态同步。


---

# 十二、安全设计


包括：

- 身份认证；
- 权限控制；
- Session隔离。


---

# 十三、方案B


直接暴露Gradio端口。


优势：

简单。


缺点：

扩展能力有限。


---

# 十四、方案C


只允许本机访问。


优势：

安全简单。


缺点：

无法远程使用。


---

# 十五、最终技术路线


采用：

Distributed Voice Access Gateway。


---

# 十六、验证要求


测试：

- 多设备连接；
- WebSocket稳定性；
- Session恢复；
- 权限控制；
- 长时间运行。


---

# 十七、状态

QA-073完成。
