# QA-008

## 问题

确定Qwen3-TTS-1.7B双T4推理优化策略。


## 用户选择

A


## 确认方案

采用单TTS Worker + CUDA深度优化。


## GPU架构

GPU0:

Qwen3-TTS-1.7B

负责：

- Voice Clone推理；
- Speaker Embedding；
- Prompt Cache；
- 音频生成。


GPU1:

负责：

- DeepSeek LLM；
- Scheduler；
- Segmenter；
- 调度管理。


## 推理优化方向

计划实现：

- torch.compile；
- CUDA Graph；
- FP16/BF16；
- 模型预热；
- Tensor优化；
- Voice Clone Prompt Cache。


## 技术原因

单TTS Worker可以：

1.

保持音质一致。

2.

减少双Worker同步问题。

3.

降低实时调度复杂度。

4.

方便定位性能瓶颈。


## 后续开发要求

需要增加：

- TTS耗时监控；
- GPU利用率监控；
- 显存监控；
- 首音频延迟测试。


## 验证标准

必须测试：

- 单段生成速度；
- 连续生成稳定性；
- 音质一致性；
- 长时间运行。


## 状态

QA-008完成。
