# QA-045

# ViiTorVoice Rust实时音频Runtime设计方案确认


## 一、问题背景

实时语音系统链路：

TTS生成

↓

音频数据

↓

Buffer

↓

浏览器播放


可能出现：

- 调度抖动；
- underrun；
- CPU开销；
- 长时间运行不稳定。


需要设计高性能音频Runtime。


---

# 二、具体提问

如何设计实时音频Runtime，使流式TTS生成和播放保持低延迟、高稳定？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Rust Zero-copy Audio Runtime（推荐）


---

# 五、整体架构


Python TTS


↓

Shared Memory / IPC


↓

Rust Audio Runtime


↓

Lock-free Ring Buffer


↓

WebAudio


---

# 六、Rust Runtime职责


## Ring Buffer


负责：

- 音频缓存；
- 数据流转；
- 高性能读写。


---

## 时间戳管理


记录：

- 音频生成时间；
- 播放时间；
- 延迟。


---

## Buffer水位控制


监控：

- 当前缓存；
- 预测不足风险。


---

## Underrun检测


检测：

播放是否可能中断。


提前：

通知生成端补充。


---

# 七、Zero-copy设计


目标：

减少：

- 内存复制；
- CPU负担。


---

# 八、方案B


## 纯Python音频队列


优势：

实现简单。


缺点：

受到：

- Python GC；
- 调度影响。


---

# 九、方案C


## Go Runtime


优势：

并发开发方便。


缺点：

实时音频生态较弱。


---

# 十、最终技术路线


采用：

Rust Zero-copy Audio Runtime。


结合：

- Shared Memory；
- Lock-free Ring Buffer；
- Dynamic Watermark。


---

# 十一、验证要求


测试：

- 播放延迟；
- underrun次数；
- CPU占用；
- 长时间稳定性。


---

# 十二、状态

QA-045完成。
