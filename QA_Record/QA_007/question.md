# QA-007

## 问题

确定Rust Runtime在ViiTorVoice系统中的职责。


## 用户选择

A


## 确认方案

Rust作为独立实时音频Runtime。


## 架构职责

Python TTS

↓

PCM Chunk

↓

Rust Audio Runtime


Rust负责：

- PCM Ring Buffer；
- 时间戳管理；
- 动态水位控制；
- underrun predictor；
- PCM完整性检查；
- 音频调度。


↓

TypeScript WebAudio

↓

扬声器


## 技术原因

Python适合：

- AI推理；
- 模型管理；
- 数据处理。


但是实时音频调度需要：

- 低延迟；
- 稳定线程；
- 精确时间控制。


Rust可以减少：

- Python GC影响；
- CPU调度抖动；
- 缓冲不稳定。


## 后续开发要求

需要实现：

- Rust Ring Buffer测试；
- PCM传输测试；
- 延迟监控；
- 长时间运行测试。


## 验证标准

必须验证：

- 连续播放稳定；
- 无buffer underrun；
- CPU占用稳定；
- 长时间运行无崩溃。


## 状态

QA-007完成。
