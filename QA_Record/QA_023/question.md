# QA-023

# ViiTorVoice Underrun Predictor断流预测方案确认


## 一、问题背景

ViiTorVoice要求：

实时生成克隆语音。

同时：

播放器持续播放PCM。


系统不能等到：

Buffer为空

↓

播放中断


才进行处理。


需要提前预测风险。


---

# 二、具体提问

如何设计Underrun Predictor，使系统能够提前发现播放断流风险并自动调整？


---

# 三、方案A

## 时间序列预测 + Buffer状态机（推荐）


流程：


Buffer历史数据

↓

分析：

- Buffer变化速度；
- TTS生成速度；
- 播放消耗速度。


↓

预测未来Buffer曲线


↓

状态机判断


↓

调整：

- Scheduler优先级；
- TTS生成速度；
- Buffer目标水位。


---

# 四、状态设计


## NORMAL


正常状态。


Buffer充足。


---

## WARNING


预测未来可能不足。


提前增加生成优先级。


---

## CRITICAL


存在断流风险。


立即：

- 提升TTS优先级；
- 增加缓存。


---

## RECOVERY


恢复稳定后：

逐渐降低压力。


---

# 五、方案B

## 简单阈值检测


规则：

Buffer < 1秒

触发报警。


优势：

简单。


缺点：

可能发现太晚。


---

# 六、方案C

## 只统计underrun次数


记录：

发生次数。


优势：

简单。


缺点：

只能事后分析。


---

# 七、用户选择

选择：

A


---

# 八、最终技术路线


采用：

时间序列预测 + Buffer状态机。


结合：


Rust Ring Buffer

↓

Dynamic Watermark Controller

↓

Underrun Predictor

↓

Scheduler


---

# 九、开发要求


必须记录：

- Buffer历史曲线；
- 预测结果；
- 状态变化；
- 恢复时间。


---

# 十、验证标准


必须确认：

- 提前发现风险；
- 无明显断音；
- Scheduler响应及时；
- 长时间稳定。


---

# 十一、状态

QA-023完成。
