# QA-115

# ViiTorVoice多用户GPU资源隔离设计方案确认


## 一、问题背景

ViiTorVoice未来需要支持多个用户同时使用。


需要解决：

- GPU资源竞争；
- 显存占用；
- 推理优先级。


---

# 二、具体提问

如何设计多用户GPU资源管理系统，使多个Session能够稳定共享GPU并避免资源冲突？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## GPU Resource Scheduler + Quota Manager


---

# 五、整体架构


User Request


↓

Session Manager


↓

GPU Resource Scheduler


↓

GPU Runtime


↓

Inference Worker


---

# 六、GPU Resource Scheduler


负责：

- GPU任务分配；
- 请求调度；
- 负载管理。


---

# 七、Quota Manager


负责：

- 用户资源限制；
- 显存保护；
- 防止单用户占满GPU。


---

# 八、优先级管理


支持：

- 实时语音优先；
- 普通任务排队；
- 资源动态调整。


---

# 九、方案B


完全共享GPU。


优势：

简单。


缺点：

容易资源冲突。


---

# 十、方案C


每用户独占GPU。


优势：

隔离强。


缺点：

GPU利用率低。


---

# 十一、最终技术路线


采用：

GPU Resource Scheduler + Quota Manager。


---

# 十二、验证要求


测试：

- 多用户并发；
- 显存稳定；
- 调度公平性；
- 长时间运行。


---

# 十三、状态

QA-115完成。
