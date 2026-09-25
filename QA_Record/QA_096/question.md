# QA-096

# ViiTorVoice最终Kaggle双T4一键部署架构设计方案确认


## 一、问题背景

前面已经确定：

- Streaming TTS；
- WebAudio实时播放；
- 双T4 GPU流水线；
- Rust音频层；
- Benchmark；
- 自动恢复。


需要整合成为完整部署系统。


---

# 二、具体提问

如何设计ViiTorVoice在Kaggle双T4环境中的一键启动生产运行架构？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## One Click Production Runtime（推荐）


---

# 五、整体架构


Start Script


↓

Environment Manager


↓

Model Manager


↓

GPU Runtime


↓

API Server


↓

Frontend


↓

Benchmark


---

# 六、Start Script


负责：

启动整个系统。


功能：

- 初始化环境；
- 调用组件；
- 输出服务地址。


---

# 七、Environment Manager


负责：

检查：

- Python环境；
- CUDA；
- 依赖库。


---

# 八、Model Manager


负责：

加载：

- LLM；
- TTS；
- Speaker Encoder。


---

# 九、GPU Runtime


GPU0：

负责：

- Voice Encoder；
- TTS；
- Rust Audio Engine。


GPU1：

负责：

- LLM；
- Text Processing。


---

# 十、API Server


提供：

HTTP API。


支持：

- 文本输入；
- Speaker选择。


---

# 十一、WebSocket Streaming


提供：

实时：

- PCM Chunk；
- 音频流。


---

# 十二、Frontend


提供：

WebAudio Timeline播放。


实现：

低延迟浏览器播放。


---

# 十三、Benchmark


启动后自动测试：

- TTFA；
- 延迟；
- GPU状态；
- 音频连续性。


---

# 十四、方案B


手动启动组件。


优势：

简单。


缺点：

容易错误。


---

# 十五、方案C


只提供代码。


优势：

开发自由。


缺点：

无法直接运行。


---

# 十六、最终技术路线


采用：

One Click Production Runtime。


---

# 十七、验证要求


测试：

- Kaggle启动；
- 双GPU分配；
- 模型加载；
- 服务访问；
- 自动恢复。


---

# 十八、状态

QA-096完成。
