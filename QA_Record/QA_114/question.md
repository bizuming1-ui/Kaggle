# QA-114

# ViiTorVoice Session Manager状态管理设计方案确认


## 一、问题背景

ViiTorVoice需要管理用户实时语音会话。


流程：

User

↓

Session

↓

Speaker

↓

Runtime

↓

Audio Stream


---

# 二、具体提问

如何设计Session Manager，使ViiTorVoice支持多用户状态管理、断线恢复和实时任务跟踪？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Distributed Session State Manager


---

# 五、整体架构


User


↓

Session Manager


↓

Speaker Registry


↓

Runtime


↓

Audio Stream


---

# 六、Session Manager职责


管理：

- Session创建；
- Session销毁；
- 状态同步；
- 生命周期管理。


---

# 七、状态数据


保存：


User状态


Session ID


Speaker Embedding ID


Current Task


Audio Progress


Connection State


---

# 八、功能


支持：

- 多用户；
- 断线恢复；
- 状态持久化；
- 任务恢复。


---

# 九、方案B


本地内存Session。


优势：

简单。


缺点：

无法扩展。


---

# 十、方案C


文件保存Session。


优势：

实现简单。


缺点：

性能低。


---

# 十一、最终技术路线


采用：

Distributed Session State Manager。


---

# 十二、验证要求


测试：

- 多用户；
- Session恢复；
- 状态一致性；
- 长时间运行。


---

# 十三、状态

QA-114完成。
