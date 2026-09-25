# QA-009

## 问题

确定ViiTorVoice全链路性能监控方案。


## 用户选择

A


## 确认方案

采用Performance Trace系统。


## 监控范围

完整链路：

用户输入

↓

DeepSeek首Token

↓

Segmenter

↓

TTS请求

↓

TTS首音频

↓

PCM Buffer

↓

Rust Runtime

↓

WebAudio播放


## 监控指标

系统指标：

- GPU利用率；
- 显存；
- CPU；
- RAM。


音频指标：

- Buffer水位；
- underrun次数；
- 播放延迟；
- 连续播放状态。


性能指标：

- 首Token时间；
- 首音频时间；
- 单段TTS耗时；
- 总响应时间。


## 日志设计

logs/

latency.json

gpu.json

audio_buffer.json

quality.json


## 技术原因

全链路监控可以：

1.

定位真实瓶颈。

2.

避免盲目优化。

3.

比较每次代码修改效果。


## 后续开发要求

每增加一个功能：

必须增加：

- 测试程序；
- 性能记录；
- 错误记录。


## 验证标准

必须能够回答：

- 哪一步耗时最高；
- 优化是否有效；
- 是否影响已有功能。


## 状态

QA-009完成。
