# QA-002

## 问题

确定ViiTorVoice后续开发代码基线。


## 用户选择

A


## 冻结基线

ViiTorVoice_DeepSeek_Kaggle_ONECLICK_FINAL_v92.3_ALL_SEGMENTS_SESSION_REPLAY.py


## 选择原因

该版本已经验证存在可用功能。

为了满足：

- 保留已有功能；
- 不破坏流式生成；
- 不破坏自动播放；
- 保证后续优化可回滚；

采用v92.3作为唯一稳定基线。


## 后续优化路线

v92.3

↓

性能监控系统

↓

LLM Streaming优化

↓

Qwen3-TTS-1.7B优化

↓

Voice Clone Prompt Cache

↓

双T4 Worker

↓

CUDA Graph / torch.compile

↓

Rust实时音频Runtime

↓

TypeScript WebAudio播放器

↓

Kaggle一键启动版本


## 开发约束

1.
禁止一次性重构整个项目。

2.
每个功能单独修改。

3.
每个功能增加测试。

4.
测试通过后保存Kaggle Dataset。

5.
所有修改记录到GitHub。


## 验证标准

必须验证：

- 原功能正常；
- 新功能正常；
- 无新增错误；
- 性能数据可比较。


## 状态

QA-002完成。
