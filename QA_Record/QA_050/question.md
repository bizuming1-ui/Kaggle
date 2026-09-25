# QA-050

# ViiTorVoice Kaggle一键启动架构设计方案确认


## 一、问题背景

最终系统需要部署到Kaggle。


目标：

用户打开Kaggle Notebook后，

通过一次启动操作，

自动完成整个语音系统初始化。


---

# 二、具体提问

如何设计ViiTorVoice生产级Kaggle启动系统，实现模型恢复、GPU初始化、服务启动和监控自动化？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## One Click Production Launcher（推荐）


---

# 五、整体架构


ViiTorVoice


↓

start.py


↓

Environment Checker


↓

Dataset Restore


↓

Model Loader


↓

GPU Scheduler


↓

LLM Worker


↓

Qwen3-TTS Worker


↓

Rust Audio Runtime


↓

Web Server


↓

Watchdog


---

# 六、启动流程


## 1. Environment Checker


检测：

- Python版本；
- CUDA；
- PyTorch；
- GPU数量。


---

## 2. Dataset Restore


恢复：

- 模型；
- Voice Prompt Cache；
- 配置；
- Benchmark数据。


---

## 3. Model Loader


加载：

- DeepSeek LLM；
- Qwen3-TTS；
- Embedding Cache。


---

## 4. GPU Scheduler


管理：

双T4资源分配。


规划：

GPU Worker。


---

## 5. Runtime启动


启动：

- Python AI层；
- Rust Audio Runtime；
- Web播放器。


---

## 6. Watchdog


监控：

- GPU状态；
- 延迟；
- Buffer水位；
- underrun。


---

# 七、方案B


单Notebook全部代码。


优势：

启动简单。


缺点：

维护困难。


---

# 八、方案C


多个Notebook手动启动。


优势：

开发方便。


缺点：

容易出现人为错误。


---

# 九、最终技术路线


采用：

One Click Production Launcher。


目标：

Kaggle一键启动生产版本。


---

# 十、验证要求


测试：

- 冷启动时间；
- 模型恢复；
- GPU识别；
- 双T4使用；
- 服务状态；
- 长时间运行。


---

# 十一、状态

QA-050完成。
