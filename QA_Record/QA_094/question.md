# QA-094

# ViiTorVoice实时性能Benchmark测试体系设计方案确认


## 一、问题背景

实时语音克隆系统需要量化性能。


完整链路：

Input Text

↓

LLM

↓

TTS

↓

Audio

↓

Playback


需要建立自动测试体系。


---

# 二、具体提问

如何建立ViiTorVoice自动化Benchmark系统，持续测试延迟、音频稳定性、GPU性能和声音质量？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 完整Benchmark自动测试系统（推荐）


---

# 五、整体架构


Benchmark Runner


↓

Telemetry Collector


↓

Metrics Database


↓

Report Generator


---

# 六、Benchmark Runner


负责：

自动执行测试。


包括：

- 文本输入；
- 推理流程；
- 音频生成。


---

# 七、Telemetry Collector


负责收集：

运行数据。


包括：

- 时间戳；
- GPU状态；
- 音频状态。


---

# 八、Metrics Database


保存：

历史测试结果。


用于：

版本比较。


---

# 九、Report Generator


生成：

测试报告。


比较：

不同版本性能。


---

# 十、测试指标


## 延迟指标


包括：

TTFA：

首次音频时间。


End-to-End Latency：

完整链路延迟。


Chunk Latency：

音频片段延迟。


---

## 音频指标


包括：

- GAP；
- Buffer Underrun；
- PCM连续性。


---

## GPU指标


包括：

- GPU利用率；
- 显存；
- 推理速度。


---

## 质量指标


包括：

- Speaker Similarity；
- MOS。


---

# 十一、方案B


人工听感测试。


优势：

简单。


缺点：

无法精确比较。


---

# 十二、方案C


只监控GPU。


优势：

容易。


缺点：

不能反映用户体验。


---

# 十三、最终技术路线


采用：

完整Benchmark自动测试系统。


---

# 十四、验证要求


测试：

- 多版本比较；
- 长时间运行；
- 极限负载。


---

# 十五、状态

QA-094完成。
