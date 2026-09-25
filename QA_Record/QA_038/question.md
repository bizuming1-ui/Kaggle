# QA-038

# ViiTorVoice动态水位控制方案确认


## 一、问题背景

实时TTS播放过程中可能出现：

生成快

↓

Buffer满


生成慢

↓

Buffer空


导致：

播放停止

等待生成

再次播放。


需要解决：

生成、停止循环。


---

# 二、具体提问

如何设计实时音频Buffer控制，使TTS生成和播放保持稳定连续？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Adaptive Watermark + Underrun Predictor（推荐）


---

# 五、整体流程


Audio Buffer

↓

实时监测

↓

预测Buffer未来状态

↓

动态调整水位


---

# 六、监测指标


## buffer_level


当前音频缓存量。


---

## GPU_latency


GPU生成延迟。


---

## network_jitter


网络传输波动。


---

## TTS_speed


当前语音生成速度。


---

# 七、动态控制


## Buffer低


执行：

- 提高TTS任务优先级；
- 提前生成下一段。


---

## Buffer高


执行：

- 降低生成压力；
- 避免过量缓存。


---

# 八、Underrun Predictor


预测：

未来Buffer是否不足。


提前：

启动补充生成。


---

# 九、方案B


## 固定Buffer大小


优势：

简单。


缺点：

不能适应：

- GPU变化；
- TTS速度变化。


---

# 十、方案C


## 无限增加Buffer


优势：

减少断音。


缺点：

增加播放延迟。


---

# 十一、最终技术路线


采用：

Adaptive Watermark Controller

+

Underrun Predictor


配合：

Rust Ring Buffer。


---

# 十二、验证要求


测试：


- Buffer稳定性；
- underrun次数；
- 延迟；
- 长时间播放。


---

# 十三、状态

QA-038完成。
