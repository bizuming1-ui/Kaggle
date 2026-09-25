# QA-110

# ViiTorVoice Ring Buffer ABI数据协议设计方案确认


## 一、问题背景

ViiTorVoice包含多个实时模块：

TTS

↓

PCM Memory

↓

Rust Audio Engine

↓

WebSocket

↓

Browser


需要统一音频数据协议。


---

# 二、具体提问

如何设计Python、Rust和Browser之间的PCM数据交换协议，实现低延迟、稳定和可验证的Streaming？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Fixed ABI PCM Streaming Protocol


---

# 五、数据结构


包含：


PCM Format


Sample Rate


Channels


Chunk Size


Timestamp


Sequence ID


CRC


---

# 六、协议目标


实现：

- 跨语言兼容；
- 数据一致性；
- 低延迟传输；
- 错误检测。


---

# 七、Ring Buffer


负责：

缓存PCM Chunk。


功能：

- 防止丢包；
- 控制播放节奏。


---

# 八、CRC校验


负责：

检测：

数据损坏。


---

# 九、Sequence ID


负责：

保证：

Chunk顺序。


---

# 十、方案B


JSON音频协议。


优势：

简单。


缺点：

性能低。


---

# 十一、方案C


裸数据传输。


优势：

速度快。


缺点：

缺少验证机制。


---

# 十二、最终技术路线


采用：

Fixed ABI PCM Streaming Protocol。


---

# 十三、验证要求


测试：

- Python/Rust兼容；
- PCM连续性；
- CRC正确；
- 长时间Streaming。


---

# 十四、状态

QA-110完成。
