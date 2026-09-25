# QA-108

# ViiTorVoice推理Scheduler队列设计方案确认


## 问题

如何设计实时语音克隆推理调度系统，实现低延迟、多任务并发和GPU资源管理？


---

## 用户选择

A


---

# Priority Async Scheduler


架构：


Request

↓

Priority Queue

↓

Scheduler

↓

Worker Pool

↓

GPU Runtime


---

# 功能


## Priority Queue

负责：

- 请求排序；
- 实时任务优先。


## Scheduler

负责：

- GPU分配；
- Worker调度。


## Worker Pool

负责：

- 并行推理；
- 任务执行。


---

# 优化目标


实现：

- 低延迟；
- 高GPU利用率；
- 支持并发。


---

# 最终方案

采用：

Priority Async Scheduler。


---

# 状态

QA-108完成。
