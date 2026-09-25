# QA-034

# ViiTorVoice CPU调度优化方案确认


## 一、问题背景

ViiTorVoice整体链路：

LLM

↓

TTS Worker

↓

Rust Runtime

↓

WebAudio


需要解决：

- Python线程调度；
- CPU抢占；
- 数据复制；
- IPC开销。


目标：

双T4环境下CPU不能成为GPU等待瓶颈。


---

# 二、具体提问

实时语音系统应该如何设计CPU调度，使GPU计算稳定，同时降低播放抖动？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## CPU亲和性 + Worker隔离 + Async IO（推荐）


---

# 五、CPU角色划分


## Core 0-3

负责：

LLM Scheduler


任务：

- 管理LLM输出；
- 文本切分；
- 请求调度。


---

## Core 4-7

负责：

TTS Controller


任务：

- 管理Qwen3-TTS请求；
- 调度GPU Worker。


---

## Core 8-11

负责：

Rust Audio Runtime


任务：

- PCM处理；
- Buffer管理；
- 播放控制。


---

## Core 12+

负责：

Monitoring


任务：

- 性能采集；
- Watchdog；
- 日志。


---

# 六、核心优化


## CPU Affinity


绑定：

不同任务到指定CPU。


减少：

线程随机迁移。


---

## Worker隔离


避免：

LLM、TTS、Audio互相抢占。


---

## Async IO


减少：

阻塞等待。


提高：

并发能力。


---

# 七、方案B


## 全部交给操作系统调度


优势：

简单。


缺点：

实时音频可能出现波动。


---

# 八、方案C


## 增加CPU线程数量


优势：

吞吐增加。


缺点：

可能增加竞争。


---

# 九、最终技术路线


采用：


CPU Affinity

+

Worker Isolation

+

Async Runtime


配合：

双T4 GPU Worker。


---

# 十、验证要求


监测：


- CPU利用率；
- Thread切换；
- Scheduler延迟；
- GPU等待时间；
- Audio Buffer稳定性。


---

# 十一、状态

QA-034完成。
