# QA-071

# ViiTorVoice Kaggle一键启动与自动部署系统设计方案确认


## 一、问题背景

Kaggle Runtime存在：

- 重启；
- 环境释放；
- 临时状态丢失。


如果每次手动配置：

会导致：

- 操作复杂；
- 容易出错；
- 恢复时间增加。


需要建立一键启动系统。


---

# 二、具体提问

如何设计Kaggle One-Click Launcher，使ViiTorVoice能够自动恢复并启动完整系统？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Kaggle One-Click Production Launcher（推荐）


---

# 五、整体架构


Launcher


↓

Environment Checker


↓

Dataset Restore


↓

Model Loader


↓

Service Manager


↓

Health Monitor


↓

Ready


---

# 六、Environment Checker


检测：


## Python


检查：

- Python版本；
- 依赖。


---

## CUDA


检查：

- CUDA版本；
- GPU可用。


---

## PyTorch


检查：

- CUDA支持；
- Tensor计算。


---

## Transformers


检查：

模型运行环境。


---

# 七、Dataset Restore


恢复：

- Qwen3-TTS模型；
- DeepSeek模型；
- Prompt Cache；
- 配置文件。


---

# 八、Model Loader


加载：

- LLM；
- TTS；
- Voice Encoder。


---

# 九、Service Manager


启动：


## LLM Worker


负责：

文本生成。


---

## TTS Worker


负责：

声音克隆。


---

## Rust Runtime


负责：

实时音频。


---

## WebAudio服务


负责：

浏览器播放。


---

# 十、Health Monitor


检查：

- GPU状态；
- Worker状态；
- API状态。


异常：

自动诊断。


---

# 十一、方案B


手动多个Notebook Cell。


优势：

方便调试。


缺点：

步骤多。


---

# 十二、方案C


只保存Notebook最终状态。


优势：

简单。


缺点：

恢复不稳定。


---

# 十三、最终技术路线


采用：

Kaggle One-Click Production Launcher。


---

# 十四、验证要求


测试：

- Runtime重启；
- 自动恢复；
- 模型加载；
- 服务启动；
- 健康检查。


---

# 十五、状态

QA-071完成。
