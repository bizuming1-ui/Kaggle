# QA-054

# ViiTorVoice Underrun Predictor设计方案确认


## 一、问题背景

实时语音播放中：

Buffer耗尽会导致：

- 停顿；
- GAP；
- 播放不连续。


传统方式：

等待Buffer=0后处理。


这种方式无法避免中断。


---

# 二、具体提问

如何提前预测音频Buffer不足风险，并提前调度TTS生成？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## RTF + Buffer Trend Underrun Predictor（推荐）


---

# 五、整体架构


Audio Metrics


↓

Prediction Model


↓

Risk Score


↓

Scheduler Adjustment


---

# 六、输入数据


## Buffer Trend


记录：

缓存增长和消耗趋势。


---

## TTS RTF


记录：

生成速度。

RTF：

生成时间 / 音频时间。


---

## GPU状态


记录：

- GPU利用率；
- 显存；
- 推理压力。


---

## Playback Speed


记录：

实际播放速度。


---

# 七、预测输出


生成：

Underrun Risk Score。


表示：

未来发生播放中断概率。


---

# 八、调度策略


当风险升高：


提前：

- 增加TTS任务；
- 提升Buffer目标；
- 调整Worker。


---

# 九、方案B


Buffer=0后处理。


优势：

简单。


缺点：

已经发生停顿。


---

# 十、方案C


固定大量预生成。


优势：

简单。


缺点：

增加：

- 延迟；
- 显存压力。


---

# 十一、最终技术路线


采用：

RTF + Buffer Trend Underrun Predictor。


结合：

Dynamic Watermark Controller。


---

# 十二、验证要求


测试：

- 预测准确率；
- underrun次数；
- Buffer稳定性；
- 长时间播放。


---

# 十三、状态

QA-054完成。
