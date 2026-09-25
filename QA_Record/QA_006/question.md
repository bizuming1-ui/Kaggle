# QA-006

## 问题

确定ViiTorVoice实时音频播放架构。


## 用户选择

A


## 确认方案

采用TypeScript WebAudio + 动态缓冲系统。


## 音频链路

Qwen3-TTS-1.7B

↓

PCM Chunk

↓

Rust Audio Runtime

↓

WebSocket/WebRTC

↓

TypeScript WebAudio

↓

AudioWorklet

↓

扬声器


## 核心目标

实现：

- 一边生成一边播放；
- 无明显播放GAP；
- 无生成停止循环；
- 动态水位控制；
- underrun预测；
- 长时间稳定运行。


## 技术原因

浏览器WebAudio具有：

- 精确播放时间控制；
- 低延迟音频调度；
- AudioWorklet实时处理能力。


相比：

Gradio Audio：

- 缓冲控制能力不足；
- 难以实现工业级连续播放。


Python本地播放：

- 不适合Kaggle远程部署。


## 后续开发要求

需要增加：

- Buffer状态监控；
- 播放延迟监控；
- underrun统计；
- 网络抖动测试。


## 验证标准

必须验证：

- 连续播放30分钟以上；
- 无明显停顿；
- 无缓冲耗尽；
- 音频时间连续。


## 状态

QA-006完成。
