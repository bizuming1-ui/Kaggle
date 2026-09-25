# QA-116

# ViiTorVoice Benchmark自动测试体系设计方案确认


## 一、问题背景

ViiTorVoice需要建立自动化性能验证系统。


目标：

每次修改后能够自动检测：

- 延迟；
- 性能；
- 稳定性。


---

# 二、具体提问

如何设计Benchmark系统，对实时语音克隆完整链路进行自动性能测试？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Automatic Benchmark Framework


---

# 五、测试流程


Input Text


↓

TTS Runtime


↓

PCM Stream


↓

Audio Playback


---

# 六、测试指标


## TTFA


记录：

首次音频输出时间。


---

## RTF


记录：

生成速度与播放速度比例。


---

## GPU指标


包括：

- GPU利用率；
- 显存占用。


---

## Audio指标


包括：

- PCM连续性；
- 丢帧；
- 长时间稳定性。


---

# 七、自动化能力


支持：

- 自动运行测试；
- 自动生成报告；
- 回归比较。


---

# 八、方案B


人工测试。


缺点：

无法保证一致性。


---

# 九、方案C


简单日志统计。


缺点：

数据不足。


---

# 十、最终技术路线


采用：

Automatic Benchmark Framework。


---

# 十一、验证要求


测试：

- 单次推理；
- 长时间运行；
- 多请求压力；
- GPU稳定性。


---

# 十二、状态

QA-116完成。
