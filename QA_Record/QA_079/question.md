# QA-079

# ViiTorVoice端到端数据一致性与事件驱动架构设计方案确认


## 一、问题背景

ViiTorVoice包含多个核心模块：

- LLM；
- Segmenter；
- TTS；
- Audio Runtime；
- Telemetry。


模块之间如果直接同步调用：

可能出现：

- 状态丢失；
- 数据不同步；
- 故障难恢复。


需要建立统一事件驱动系统。


---

# 二、具体提问

如何设计ViiTorVoice事件驱动架构，使所有模块状态一致并支持恢复和扩展？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Event-Driven Voice Runtime Architecture（推荐）


---

# 五、整体架构


Components


↓

Event Bus


↓

Stream Processor


↓

State Store


↓

Recovery System


---

# 六、Event Producer


负责产生事件。


例如：

## LLM Event


记录：

- Token生成；
- 文本状态。


---

## TTS Event


记录：

- 开始生成；
- 音频完成。


---

## Audio Event


记录：

- Buffer状态；
- 播放状态。


---

## Telemetry Event


记录：

- 性能数据。


---

# 七、Event Bus


负责：

模块间异步通信。


优点：

降低模块耦合。


---

# 八、事件数据结构


包含：


Event ID


Timestamp


Session ID


Component ID


Status


---

# 九、Stream Processor


处理：

- 事件排序；
- 状态更新；
- 数据分析。


---

# 十、State Store


保存：

- Session状态；
- Worker状态；
- Audio状态。


支持：

故障恢复。


---

# 十一、Recovery System


利用事件历史：

恢复：

- 当前任务；
- 用户状态；
- 服务状态。


---

# 十二、方案B


模块直接调用。


优势：

简单。


缺点：

耦合严重。


---

# 十三、方案C


共享全局状态变量。


优势：

开发快。


缺点：

并发风险高。


---

# 十四、最终技术路线


采用：

Event-Driven Voice Runtime Architecture。


---

# 十五、验证要求


测试：

- 事件完整性；
- 状态恢复；
- 异步通信；
- 长时间运行。


---

# 十六、状态

QA-079完成。
