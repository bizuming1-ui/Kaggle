# QA-093

# ViiTorVoice Rust高性能音频处理层设计方案确认


## 一、问题背景

ViiTorVoice实时语音链路：

TTS

↓

PCM处理

↓

WebSocket

↓

Browser播放


如果全部使用Python处理实时音频：

可能出现：

- GC暂停；
- Buffer抖动；
- CPU压力。


需要引入高性能音频层。


---

# 二、具体提问

是否采用Python + Rust混合架构，由Rust负责实时音频处理，提高ViiTorVoice稳定性？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Python + Rust混合音频架构（推荐）


---

# 五、整体架构


Python


↓

TTS AI推理


↓

Rust Audio Engine


↓

Ring Buffer


↓

WebSocket


↓

WebAudio


---

# 六、Python职责


负责：

- TTS模型；
- Voice Clone；
- AI逻辑；
- 任务调度。


优势：

拥有完整AI生态。


---

# 七、Rust职责


负责：

## PCM Buffer


管理实时音频缓存。


---

## 音频格式转换


处理：

- PCM；
- Sample Rate；
- Channel。


---

## 内存管理


减少：

- GC；
- 延迟波动。


---

## CRC校验


保证：

音频数据完整。


---

## 零拷贝传输


降低：

CPU复制开销。


---

# 八、优势


结合：

Python：

AI开发效率。


Rust：

实时性能。


---

# 九、方案B


全部Python。


优势：

开发简单。


缺点：

实时性能有限。


---

# 十、方案C


全部Rust。


优势：

性能最高。


缺点：

AI模型生态开发困难。


---

# 十一、最终技术路线


采用：

Python + Rust混合音频架构。


---

# 十二、验证要求


测试：

- CPU占用；
- Buffer稳定；
- 延迟；
- 长时间运行。


---

# 十三、状态

QA-093完成。
