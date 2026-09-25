# QA-069

# ViiTorVoice Underrun Predictor音频断流预测系统设计方案确认


## 一、问题背景

实时语音播放过程中：

如果TTS生成速度低于播放消耗速度：

会导致：

- Buffer下降；
- 音频断流；
- 播放停止。


传统检测：

发现Buffer为空时已经太晚。


需要提前预测。


---

# 二、具体提问

如何设计Underrun Predictor，使系统能够提前预测音频缓存耗尽风险？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Predictive Audio Underrun Prevention System（推荐）


---

# 五、整体架构


Telemetry Data


↓

Predictor Model


↓

Risk Estimator


↓

Scheduler


↓

TTS Worker


---

# 六、输入数据


## Buffer状态


包括：

- 当前长度；
- 增长速度；
- 消耗速度。


---

## TTS性能


包括：

- 推理时间；
- RTF；
- 生成速度。


---

## GPU状态


包括：

- 利用率；
- 显存；
- Worker状态。


---

# 七、Risk Estimator


输出：


## SAFE


状态正常。


---

## WARNING


预测可能下降。


动作：

提前增加生成任务。


---

## CRITICAL


高风险。


动作：

启动恢复机制。


---

# 八、Scheduler联动


根据风险等级：

动态调整：

- TTS任务数量；
- Buffer目标水位；
- Worker优先级。


---

# 九、方案B


只检测Buffer为空。


优势：

简单。


缺点：

发现时已经发生断流。


---

# 十、方案C


固定提前生成大量音频。


优势：

简单。


缺点：

增加：

- 延迟；
- 显存占用。


---

# 十一、最终技术路线


采用：

Predictive Audio Underrun Prevention System。


---

# 十二、验证要求


测试：

- 断流预测准确率；
- Buffer稳定性；
- 恢复速度；
- 长时间播放。


---

# 十三、状态

QA-069完成。
