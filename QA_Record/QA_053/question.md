# QA-053

# ViiTorVoice动态水位控制设计方案确认


## 一、问题背景

实时TTS播放过程中可能出现：

生成

↓

播放

↓

Buffer不足

↓

等待生成

↓

继续播放


导致：

- GAP；
- 播放停顿；
- 调度抖动。


需要设计动态缓存控制。


---

# 二、具体提问

如何设计动态水位控制系统，使流式TTS生成和WebAudio播放保持连续稳定？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Adaptive Dynamic Watermark Controller（推荐）


---

# 五、整体架构


TTS Worker


↓

Audio Buffer


↓

Watermark Controller


↓

Rust Runtime


↓

WebAudio


---

# 六、监控指标


## Buffer Level


监控：

当前音频缓存量。


---

## Playback Speed


监控：

实际播放消耗速度。


---

## TTS RTF


记录：

生成速度与音频长度比例。


---

## GPU Load


监控：

GPU计算压力。


---

## Underrun Risk


预测：

是否可能出现缓存不足。


---

# 七、动态调整策略


根据实时状态调整：


- Buffer目标长度；
- 预取数量；
- Worker速度；
- 并发数量。


---

# 八、核心目标


避免：


生成

↓

停止

↓

生成

↓

停止


实现：

连续生成。

连续播放。


---

# 九、方案B


固定Buffer大小。


优势：

简单。


缺点：

无法适应：

- GPU变化；
- 网络变化；
- 负载变化。


---

# 十、方案C


只增加大缓存。


优势：

容易实现。


缺点：

增加：

- 延迟；
- 内存占用。


---

# 十一、最终技术路线


采用：

Adaptive Dynamic Watermark Controller。


---

# 十二、验证要求


测试：

- Buffer稳定性；
- underrun次数；
- 播放连续性；
- 延迟变化；
- 长时间运行。


---

# 十三、状态

QA-053完成。
