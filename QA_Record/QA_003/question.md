# QA-003

## 问题

确定ViiTorVoice双T4 GPU部署架构。


## 用户选择

A


## 确认方案

采用双T4职责分离架构。


## GPU分工

GPU0:

Qwen3-TTS-1.7B

负责：

- Voice Clone推理；
- Speaker Embedding；
- Prompt Cache；
- 音频生成。


GPU1:

LLM + Scheduler

负责：

- DeepSeek流式输出；
- 文本Segmenter；
- 推理调度；
- 缓冲管理。


## 技术原因

该方案可以：

1.

避免LLM和TTS争抢显存。


2.

降低实时播放延迟。


3.

方便后续：

- CUDA Graph；
- torch.compile；
- Worker优化。


4.

提高长期运行稳定性。


## 后续开发要求

必须增加：

- GPU监控；
- 显存监控；
- 推理耗时记录；
- Worker健康检查。


## 验证标准

需要测试：

- GPU0 TTS稳定运行；
- GPU1 LLM稳定运行；
- 两者长时间并行无异常；
- 音频播放无中断。


## 状态

QA-003完成。
