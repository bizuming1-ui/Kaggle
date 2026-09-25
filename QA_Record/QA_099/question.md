# QA-099

# ViiTorVoice安全隔离与多用户并发架构设计方案确认


## 一、问题背景

未来ViiTorVoice需要支持多用户实时语音克隆。


例如：

User A

↓

Voice Clone Session A


User B

↓

Voice Clone Session B


需要保证：

用户之间互不影响。


---

# 二、具体提问

如何设计ViiTorVoice多用户实时语音系统，实现Session隔离、资源调度和安全控制？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Multi-Tenant Runtime Isolation（推荐）


---

# 五、整体架构


API Gateway


↓

Session Manager


↓

GPU Scheduler


↓

Isolated Voice Runtime


↓

Audio Stream


---

# 六、API Gateway


负责：

- 请求入口；
- 用户认证；
- 请求转发。


---

# 七、Session Manager


负责：

管理：

- 用户Session；
- Speaker状态；
- Audio状态。


---

# 八、Session隔离


每个用户独立：

## Speaker Embedding


避免：

声音数据混合。


---

## Audio Buffer


避免：

音频串流冲突。


---

## Session State


保存：

独立对话状态。


---

# 九、GPU Scheduler


负责：

管理：

- GPU任务；
- 推理队列；
- 资源分配。


---

# 十、Isolated Voice Runtime


每个用户拥有：

独立运行环境。


保证：

稳定性。


---

# 十一、安全控制


包括：

- API认证；
- 数据保护；
- 权限管理。


---

# 十二、方案B


单用户运行。


优势：

简单。


缺点：

无法扩展。


---

# 十三、方案C


共享所有状态。


优势：

资源利用率高。


缺点：

存在数据混合风险。


---

# 十四、最终技术路线


采用：

Multi-Tenant Runtime Isolation。


---

# 十五、验证要求


测试：

- 多用户并发；
- Session隔离；
- GPU调度；
- 数据安全。


---

# 十六、状态

QA-099完成。
