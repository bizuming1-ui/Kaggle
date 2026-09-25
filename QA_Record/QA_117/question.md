# QA-117

# ViiTorVoice Health Monitor系统设计方案确认


## 一、问题背景

ViiTorVoice需要实时监控整个运行环境。


监控对象：

Runtime

GPU

Memory

Session

Audio Stream


---

# 二、具体提问

如何设计ViiTorVoice健康监控系统，使系统能够及时发现异常并提供运行状态数据？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Runtime Health Monitor + Metrics Collector


---

# 五、整体监控架构


Runtime


↓

Metrics Collector


↓

Health Monitor


↓

Alert / Recovery


---

# 六、监控内容


## Runtime


检测：

- 推理状态；
- Worker状态；
- 请求异常。


---

## GPU


检测：

- GPU利用率；
- 显存占用；
- 温度状态。


---

## Memory


检测：

- 内存增长；
- 显存泄漏。


---

## Session


检测：

- 连接状态；
- Session异常。


---

## Audio Stream


检测：

- PCM中断；
- Chunk丢失。


---

# 七、优势


实现：

- 实时监控；
- 数据统计；
- 异常发现；
- 支持自动恢复。


---

# 八、方案B


只查看系统日志。


缺点：

发现问题较晚。


---

# 九、方案C


人工监控。


缺点：

无法持续运行。


---

# 十、最终技术路线


采用：

Runtime Health Monitor + Metrics Collector。


---

# 十一、验证要求


测试：

- GPU异常检测；
- 内存泄漏检测；
- Runtime卡死检测；
- 长时间运行。


---

# 十二、状态

QA-117完成。
