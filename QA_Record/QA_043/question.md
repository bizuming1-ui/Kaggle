# QA-043

# ViiTorVoice双T4推理调度方案确认


## 一、问题背景

Kaggle环境提供双T4 GPU。


目标：

充分利用：

GPU0

+

GPU1


提升：

- TTS速度；
- 首音频响应；
- 并发能力。


同时保证：

两个GPU生成声音质量一致。


---

# 二、具体提问

如何设计双T4架构，使Qwen3-TTS实时语音克隆稳定、高效，并保持音色一致？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 双T4专用Worker + Deterministic Scheduler（推荐）


---

# 五、整体流程


LLM


↓

Segmenter


↓

TTS Scheduler


↓

----------------------


GPU Worker 0


GPU Worker 1


↓

Audio Merge


↓

Rust Runtime


↓

WebAudio播放


---

# 六、Scheduler职责


负责：


- 任务分配；
- GPU负载检测；
- 延迟控制；
- 顺序保证。


---

# 七、GPU Worker设计


每个Worker：


拥有：

- 独立CUDA上下文；
- 相同模型版本；
- 相同推理参数。


目的：

保证输出一致性。


---

# 八、质量一致性控制


检测：

- 音频采样率；
- 音量；
- RMS；
- 频谱。


统一：

后处理流程。


---

# 九、方案B


两个GPU同时执行同一个任务。


优势：

实现简单。


缺点：

计算浪费。


---

# 十、方案C


单GPU运行。


优势：

稳定。


缺点：

无法利用双T4。


---

# 十一、最终技术路线


采用：

双T4 Worker


+

Deterministic Scheduler


+

统一Audio Merge。


---

# 十二、验证要求


测试：


- GPU利用率；
- 推理速度；
- 音质一致性；
- 首音频延迟；
- 长时间稳定运行。


---

# 十三、状态

QA-043完成。
