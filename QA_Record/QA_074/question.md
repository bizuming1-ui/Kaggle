# QA-074

# ViiTorVoice实时多用户并发GPU调度系统设计方案确认


## 一、问题背景

ViiTorVoice未来需要支持：

多个用户同时访问。


可能出现：

User A请求

+

User B请求

+

User C请求


如果没有调度：

可能导致：

- GPU资源竞争；
- 延迟增加；
- 单用户占满资源。


需要建立实时多用户调度系统。


---

# 二、具体提问

如何设计ViiTorVoice多用户实时语音请求调度系统，使GPU资源能够公平、高效分配？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Real-Time Multi-User GPU Task Scheduler（推荐）


---

# 五、整体架构


Requests


↓

Priority Queue


↓

Scheduler


↓

GPU Worker Pool


↓

Response Stream


---

# 六、Request Queue


负责：

接收：

- 用户请求；
- 音频任务；
- TTS任务。


---

# 七、Priority Scheduler


根据：

- 用户等级；
- 延迟要求；
- 任务类型；

决定执行顺序。


---

# 八、GPU Worker Pool


管理：

- GPU0 Worker；
- GPU1 Worker；
- 推理任务。


---

# 九、任务优先级


## High Priority


处理：

实时对话。


策略：

立即调度。


---

## Normal


处理：

普通请求。


策略：

进入等待队列。


---

## Background


处理：

训练；
分析；
低优先任务。


策略：

利用空闲资源。


---

# 十、资源保护


控制：

- 显存；
- GPU占用；
- 单任务时间。


防止：

单用户占用全部资源。


---

# 十一、方案B


每个用户独占GPU。


优势：

隔离简单。


缺点：

GPU利用率低。


---

# 十二、方案C


所有请求普通队列。


优势：

简单。


缺点：

实时性不足。


---

# 十三、最终技术路线


采用：

Real-Time Multi-User GPU Task Scheduler。


---

# 十四、验证要求


测试：

- 多用户并发；
- GPU利用率；
- 延迟；
- 任务公平性；
- 长时间稳定运行。


---

# 十五、状态

QA-074完成。
