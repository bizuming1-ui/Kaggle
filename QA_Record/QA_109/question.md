# QA-109

# ViiTorVoice Rust Audio Engine实时音频核心设计方案确认


## 一、问题背景

ViiTorVoice需要独立实时音频处理层。


目标：

AI生成PCM后：

稳定传输到客户端播放。


---

# 二、具体提问

如何设计ViiTorVoice低延迟音频处理引擎，实现PCM缓存、实时传输和稳定播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Rust Low Latency Audio Engine


架构：


PCM Buffer

↓

Rust Audio Engine

↓

WebSocket Streaming

↓

WebAudio


---

# 五、Rust职责


负责：


- PCM处理；
- Ring Buffer；
- 音频线程；
- 数据传输；
- 内存管理。


---

# 六、优势


实现：

- 低延迟；
- 高稳定；
- Python解耦；
- 长时间运行。


---

# 七、方案B


Python Audio处理。


缺点：

实时性能有限。


---

# 八、方案C


浏览器直接处理。


缺点：

服务端控制能力弱。


---

# 九、最终技术路线


采用：

Rust Low Latency Audio Engine。


---

# 十、验证要求


测试：

- PCM连续性；
- 延迟；
- Buffer稳定；
- 长时间运行。


---

# 十一、状态

QA-109完成。
