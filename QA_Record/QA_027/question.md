# QA-027

# ViiTorVoice统一性能监测系统设计方案确认


## 一、问题背景

ViiTorVoice要求：

每完成一个功能，都必须有监测程序。


不能凭感觉优化。


必须知道：

每一个阶段的真实耗时和资源消耗。


---

# 二、具体提问

如何设计统一监测系统，对整个语音流水线进行精准性能分析？


---

# 三、方案A

## Unified Metrics Telemetry System（推荐）


整体架构：


ViiTorVoice Components

↓

Metrics Collector

↓

Time Series Storage

↓

Dashboard



---

# 四、监控范围


## LLM阶段


记录：

- 首Token时间；
- 完整输出时间；
- Token速度。


---

## Segment阶段


记录：

- 文本切分时间；
- Segment数量；
- Segment长度。


---

## TTS阶段


记录：

- 首音频延迟；
- 单片段推理时间；
- 实时率。


---

## Buffer阶段


记录：

- 当前水位；
- Buffer变化速度；
- underrun风险。


---

## Playback阶段


记录：

- 播放延迟；
- GAP检测；
- AudioContext状态。


---

## Hardware阶段


记录：

- GPU利用率；
- 显存；
- CPU占用；
- 内存。


---

# 五、数据格式


metrics/


latency.jsonl

记录：

请求延迟。


gpu.jsonl

记录：

GPU状态。


audio.jsonl

记录：

音频质量指标。


buffer.jsonl

记录：

动态水位。


system.jsonl

记录：

系统资源。


---

# 六、方案B

## 终端日志打印


优势：

简单。


缺点：

- 不方便长期分析；
- 无法趋势分析。


---

# 七、方案C

## 只监控GPU


使用：

nvidia-smi。


优势：

GPU数据准确。


缺点：

无法分析完整语音链路。


---

# 八、用户选择

选择：

A


---

# 九、最终技术路线


采用：

Unified Metrics Telemetry。


结合：


LLM

↓

Segmenter

↓

TTS Worker

↓

Rust Runtime

↓

WebAudio


全部产生Metrics。


---

# 十、开发要求


必须实现：

- Metrics Collector；
- JSONL日志；
- 性能分析脚本；
- 阶段耗时统计。


---

# 十一、验证标准


必须确认：

- 每个模块有数据；
- 可以定位瓶颈；
- 可以指导下一步优化。


---

# 十二、状态

QA-027完成。
