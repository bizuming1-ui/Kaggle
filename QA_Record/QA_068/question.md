# QA-068

# ViiTorVoice动态水位控制系统设计方案确认


## 一、问题背景

实时语音生成播放过程中：

如果TTS生成速度和播放速度不匹配：

会出现：

- Buffer耗尽；
- 播放暂停；
- 调度抖动；
- 用户感知断续。


需要建立动态水位控制。


---

# 二、具体提问

如何设计Dynamic Watermark Controller，使ViiTorVoice能够持续生成和连续播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Adaptive Dynamic Watermark Control System（推荐）


---

# 五、整体架构


Telemetry


↓

Watermark Controller


↓

TTS Scheduler


↓

Audio Buffer


↓

Rust Runtime


↓

WebAudio Playback


---

# 六、Buffer水位管理


## Minimum Watermark


最低安全水位。


作用：

防止：

播放中断。


---

## Target Watermark


目标缓存水位。


作用：

保持：

稳定延迟。


---

## Maximum Watermark


最高缓存限制。


作用：

防止：

延迟无限增加。


---

# 七、动态调整策略


根据：

- TTS生成速度；
- 播放速度；
- Buffer变化；
- GPU负载。


自动调整：

提前生成量。


---

# 八、TTS Scheduler


负责：

决定：

什么时候：

- 提前生成；
- 降低生成；
- 增加任务。


---

# 九、Underrun Predictor


预测：

Buffer耗尽风险。


提前：

启动生成。


---

# 十、Rust Ring Buffer结合


负责：

稳定保存PCM。


提供：

低延迟读取。


---

# 十一、WebAudio Timeline结合


保证：

音频按照时间轴连续播放。


---

# 十二、方案B


固定Buffer大小。


优势：

简单。


缺点：

无法适应：

- GPU变化；
- 网络变化。


---

# 十三、方案C


增加大缓存。


优势：

容易实现。


缺点：

增加：

首音频延迟。


---

# 十四、最终技术路线


采用：

Adaptive Dynamic Watermark Control System。


---

# 十五、验证要求


测试：

- 连续播放；
- Buffer稳定；
- underrun次数；
- 延迟；
- 长时间运行。


---

# 十六、状态

QA-068完成。
