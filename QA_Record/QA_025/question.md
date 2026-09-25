# QA-025

# ViiTorVoice长时间稳定运行Watchdog设计方案确认


## 一、问题背景

ViiTorVoice需要在Kaggle环境长期运行。


可能出现：

- GPU异常；
- TTS Worker卡死；
- 网络断开；
- Buffer异常下降；
- 内存泄漏。


系统需要：

自动发现问题并恢复。


---

# 二、具体提问

实时语音系统应该如何设计Watchdog，保证长时间运行稳定？


---

# 三、方案A

## 多级 Watchdog + 自动恢复系统（推荐）


架构：


Worker Health Monitor

↓

Runtime Watchdog

↓

GPU Monitor

↓

Network Monitor

↓

Recovery Controller


---

# 四、监控内容


## GPU Monitor


检测：

- GPU利用率；
- 显存；
- CUDA状态。


---

## Runtime Watchdog


检测：

- Worker心跳；
- PCM流状态；
- Buffer状态。


---

## Network Monitor


检测：

- WebSocket连接；
- 数据传输状态。


---

## Performance Monitor


记录：

- TTS延迟；
- CPU占用；
- 内存变化。


---

# 五、自动恢复策略


异常：

↓

Recovery Controller


执行：

1.

重新启动Worker。


2.

重新加载模型。


3.

恢复Voice Clone Prompt Cache。


4.

重新建立通信。


5.

保存错误日志。


---

# 六、方案B

## 简单心跳检测


方式：

固定时间检测Worker。


优势：

简单。


缺点：

无法处理复杂故障。


---

# 七、方案C

## 人工查看日志


优势：

开发简单。


缺点：

无法自动恢复。


---

# 八、用户选择

选择：

A


---

# 九、最终技术路线


采用：

多级Watchdog系统。


结合：


GPU Worker

↓

Health Monitor

↓

Recovery Controller


---

# 十、开发要求


必须记录：

- 异常时间；
- 错误类型；
- 恢复过程；
- 恢复耗时。


---

# 十一、验证标准


必须确认：

- 长时间运行稳定；
- 异常可以恢复；
- Cache不会丢失；
- 播放不中断。


---

# 十二、状态

QA-025完成。
