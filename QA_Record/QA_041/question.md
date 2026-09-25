# QA-041

# ViiTorVoice性能监测与Benchmark系统设计方案确认


## 一、问题背景

ViiTorVoice要求：

每完成一个功能模块，都必须有监测程序。


需要知道：

输入文本

↓

LLM

↓

Segment

↓

TTS

↓

GPU

↓

Rust Buffer

↓

WebAudio


每个阶段真实耗时。


---

# 二、具体提问

如何设计统一性能监测系统，使整个语音流水线能够精准定位瓶颈？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Unified Telemetry + Trace ID + Benchmark Dashboard（推荐）


---

# 五、系统架构


所有模块


↓

Telemetry SDK


↓

统一Event


↓

JSONL日志


↓

Benchmark分析


↓

Dashboard


---

# 六、Trace ID设计


每一次请求生成唯一ID。


例如：


request_000001


用于追踪：

同一次请求经过所有模块的完整过程。


---

# 七、监测内容


## LLM阶段


记录：

- 首Token时间；
- 输出速度；
- 总耗时。


---

## Segment阶段


记录：

- 分段时间；
- 文本长度；
- 调度延迟。


---

## TTS阶段


记录：

- 首音频时间；
- Segment推理时间；
- GPU耗时。


---

## GPU阶段


记录：

- 利用率；
- 显存；
- CUDA状态。


---

## Audio阶段


记录：

- Buffer水位；
- underrun次数；
- 播放延迟。


---

# 八、方案B


## Console日志


优势：

简单。


缺点：

无法长期分析。


---

# 九、方案C


## 只记录最终速度


优势：

简单。


缺点：

无法定位具体瓶颈。


---

# 十、最终技术路线


采用：


Unified Telemetry


+

Trace ID


+

Benchmark Dashboard。


---

# 十一、验证要求


测试：


- TTFT；
- TTFA；
- TTS延迟；
- GPU性能；
- Buffer稳定性；
- 长时间运行。


---

# 十二、状态

QA-041完成。
