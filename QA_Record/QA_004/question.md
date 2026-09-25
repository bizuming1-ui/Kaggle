# QA-004

## 问题

确定Qwen3-TTS-1.7B参考音频处理方案。


## 用户选择

A


## 确认方案

采用固定高质量参考音频方案。


## 技术流程

Reference Audio

↓

Audio Preprocess

↓

Speaker Embedding

↓

Voice Clone Prompt Cache

↓

Qwen3-TTS-1.7B


## 参考音频要求

目标：

- 单人声音；
- 高质量录音；
- 无明显背景噪声；
- WAV格式优先；
- 稳定作为长期Voice Clone输入。


## 技术原因

固定参考音频可以：

1.

提高声音一致性。


2.

支持缓存：

- Speaker Embedding Cache；
- Voice Clone Prompt Cache。


3.

降低实时生成延迟。


4.

方便双T4长期运行。


## 后续开发要求

需要增加：

- Reference Audio质量检测；
- 音频采样率检测；
- 噪声分析；
- Embedding缓存测试。


## 验证标准

必须测试：

- 音色保持；
- 韵律一致性；
- 长时间生成稳定性；
- 首次生成与缓存生成速度差异。


## 状态

QA-004完成。
