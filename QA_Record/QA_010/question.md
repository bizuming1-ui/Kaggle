# QA-010

## 问题

确定Kaggle开发阶段保存和恢复方案。


## 用户选择

A


## 确认方案

采用阶段版本Dataset固化恢复。


## 工作流程

开发

↓

测试通过

↓

生成版本快照

↓

保存Kaggle Dataset

↓

下次Kaggle启动恢复


## Dataset结构

ViiTorVoice_Checkpoint/

├── code/

├── models_config/

├── cache/

├── logs/

├── tests/

└── startup/


## 保存内容

包括：

- 项目代码；
- 模型配置；
- Voice Clone Prompt Cache；
- 测试程序；
- 性能日志；
- 启动脚本。


## 版本管理

示例：

v92.3-baseline

phase1-streaming

phase2-tts

phase3-runtime


## 技术原因

阶段固化可以：

1.

避免错误修改无法恢复。


2.

保证Kaggle重连后快速继续开发。


3.

记录每个阶段真实状态。


## 后续开发要求

每完成一个阶段：

必须：

- 测试；
- 记录；
- 保存Dataset；
- 更新GitHub备忘录。


## 验证标准

恢复后必须确认：

- 代码一致；
- 配置一致；
- 缓存可用；
- 启动正常。


## 状态

QA-010完成。
