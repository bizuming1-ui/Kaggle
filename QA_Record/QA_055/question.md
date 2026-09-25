# QA-055

# ViiTorVoice实时音频监控与性能分析系统设计方案确认


## 一、问题背景

整个语音系统包含：

- LLM；
- Segmenter；
- Qwen3-TTS；
- GPU Worker；
- Rust Runtime；
- WebAudio。


后续优化必须知道：

每个阶段耗时和瓶颈。


需要建立统一监控系统。


---

# 二、具体提问

如何设计ViiTorVoice完整Telemetry系统，对每个模块进行性能监测和分析？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Unified Telemetry + Dashboard系统（推荐）


---

# 五、整体架构


所有组件


↓

Telemetry SDK


↓

Metrics Collector


↓

JSON / Database


↓

Dashboard


---

# 六、监控模块


## LLM监控


记录：

- Token速度；
- TTFT。


---

## Segmenter监控


记录：

- 分段时间；
- 文本准备时间。


---

## TTS监控


记录：

- TTFA；
- 单段推理时间；
- RTF。


---

## GPU监控


记录：

- GPU利用率；
- 显存；
- 温度。


---

## Rust Runtime监控


记录：

- Buffer水位；
- underrun次数；
- 音频延迟。


---

## WebAudio监控


记录：

- 播放连续性；
- GAP次数。


---

# 七、数据保存


保存：

- JSON；
- Database。


支持：

长期分析。


---

# 八、方案B


每个模块独立日志。


优势：

简单。


缺点：

无法统一分析。


---

# 九、方案C


只测试最终播放效果。


优势：

简单。


缺点：

无法定位瓶颈。


---

# 十、最终技术路线


采用：

Unified Telemetry + Dashboard。


---

# 十一、验证要求


测试：

- 数据采集准确性；
- 延迟统计；
- GPU监控；
- 长时间运行。


---

# 十二、状态

QA-055完成。
