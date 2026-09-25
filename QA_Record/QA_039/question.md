# QA-039

# ViiTorVoice长时间稳定运行Watchdog设计方案确认


## 一、问题背景

ViiTorVoice需要在Kaggle环境长时间运行。


完整链路：

LLM

↓

TTS Worker

↓

GPU

↓

Rust Runtime

↓

WebAudio


需要自动检测：

- GPU异常；
- Worker异常；
- Buffer异常；
- 内存泄漏；
- CUDA错误。


---

# 二、具体提问

如何设计长时间运行监控系统，使实时语音系统能够自动检测并恢复异常？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Multi-layer Watchdog + Health Check + Auto Recovery（推荐）


---

# 五、整体架构


Watchdog


↓

---------------------------


LLM Check

GPU Check

Audio Check


↓

Recovery Manager


↓

Restart / Recover


---

# 六、监控模块


## LLM Health Check


检测：

- 请求状态；
- 输出速度；
- 队列阻塞。


---

## GPU Health Check


检测：

- 显存；
- CUDA状态；
- 推理延迟。


---

## Audio Health Check


检测：

- Buffer水位；
- 播放状态；
- underrun。


---

# 七、Heartbeat机制


每个模块定期发送：

heartbeat。


用于判断：

模块是否正常运行。


---

# 八、Recovery Manager


负责：


异常发现后：

- 重启Worker；
- 恢复Queue；
- 保留Cache；
- 重新连接。


---

# 九、方案B


## 只保存日志


优势：

简单。


缺点：

需要人工恢复。


---

# 十、方案C


## 定时重启全部系统


优势：

实现简单。


缺点：

会影响：

- 当前任务；
- Cache；
- 播放状态。


---

# 十一、最终技术路线


采用：

Multi-layer Watchdog


结合：

Health Check

+

Auto Recovery。


---

# 十二、验证要求


测试：

- GPU异常恢复；
- Worker崩溃恢复；
- Buffer异常恢复；
- 长时间运行稳定性。


---

# 十三、状态

QA-039完成。
