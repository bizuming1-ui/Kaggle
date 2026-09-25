# QA-070

# ViiTorVoice全链路Telemetry性能监控系统设计方案确认


## 一、问题背景

ViiTorVoice包含：

- LLM；
- Segmenter；
- TTS；
- GPU Worker；
- Rust Runtime；
- WebAudio。


优化过程中需要知道：

每个阶段准确耗时。


---

# 二、具体提问

如何设计全链路性能监控系统，对ViiTorVoice每个模块进行精准耗时分析？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Full Pipeline Telemetry + Performance Analyzer（推荐）


---

# 五、整体架构


All Components


↓

Telemetry SDK


↓

Metrics Collector


↓

Time-Series Storage


↓

Dashboard


↓

Optimizer


---

# 六、监控链路


## User Input


记录：

用户输入时间。


---

## LLM First Token


记录：

- 首Token延迟；
- Token生成速度。


---

## Segment Ready


记录：

- 文本切分耗时；
- 等待时间。


---

## TTS Start


记录：

TTS开始时间。


---

## First Audio Generated


记录：

首音频延迟。


---

## Rust Buffer


记录：

- Buffer水位；
- PCM状态。


---

## WebAudio Play


记录：

- 播放时间；
- GAP。


---

# 七、LLM指标


监控：

- TTFT；
- Token/s。


---

# 八、TTS指标


监控：

- TTFA；
- 单片段推理时间；
- RTF。


---

# 九、GPU指标


监控：

- 显存；
- GPU利用率；
- Kernel耗时。


---

# 十、Audio指标


监控：

- Buffer变化；
- underrun次数；
- 播放间隔。


---

# 十一、Dashboard


展示：

- 实时状态；
- 历史趋势；
- 版本比较。


---

# 十二、Optimization Analyzer


根据数据：

定位：

- LLM瓶颈；
- TTS瓶颈；
- GPU瓶颈；
- Audio瓶颈。


---

# 十三、方案B


只记录日志文件。


优势：

简单。


缺点：

分析困难。


---

# 十四、方案C


只监控GPU。


优势：

简单。


缺点：

无法分析完整链路。


---

# 十五、最终技术路线


采用：

Full Pipeline Telemetry + Performance Analyzer。


---

# 十六、验证要求


测试：

- 全链路时间；
- 数据准确性；
- Dashboard展示；
- 版本性能比较。


---

# 十七、状态

QA-070完成。
