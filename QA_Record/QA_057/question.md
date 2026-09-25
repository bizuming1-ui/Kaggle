# QA-057

# ViiTorVoice长时间Watchdog稳定性监控系统设计方案确认


## 一、问题背景

实时语音系统需要长时间运行。

可能出现：

- Worker异常；
- GPU异常；
- TTS停止；
- Buffer下降；
- 播放中断；
- 服务失效。


需要设计自动检测和恢复系统。


---

# 二、具体提问

如何设计ViiTorVoice长时间运行Watchdog系统，使系统能够自动检测异常并恢复服务？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Multi-layer Watchdog + Self Recovery（推荐）


---

# 五、整体架构


System Monitor


        |


-------------------------


|          |             |


GPU      TTS        Runtime


        |


Recovery Controller


---

# 六、监控层


## GPU Worker Monitor


检测：

- GPU状态；
- 显存；
- Worker响应。


---

## LLM Monitor


检测：

- 服务状态；
- 请求响应。


---

## TTS Monitor


检测：

- 推理状态；
- 生成速度；
- 异常退出。


---

## Rust Runtime Monitor


检测：

- Audio Queue；
- Buffer水位；
- 播放状态。


---

## Web服务 Monitor


检测：

- API状态；
- WebSocket连接。


---

# 七、恢复机制


异常时执行：


## Worker恢复


重新启动异常Worker。


---

## Queue恢复


恢复任务队列。


---

## Cache检查


确认：

- 模型；
- Prompt Cache；
- 配置。


---

## Connection恢复


重新建立：

- Runtime连接；
- Web连接。


---

# 八、方案B


只记录日志。


优势：

简单。


缺点：

无法自动恢复。


---

# 九、方案C


定时重启全部服务。


优势：

实现简单。


缺点：

破坏：

- 连续播放；
- 实时状态。


---

# 十、最终技术路线


采用：

Multi-layer Watchdog + Self Recovery。


---

# 十一、验证要求


测试：

- 长时间运行；
- 异常模拟；
- 自动恢复；
- Buffer连续性；
- 服务稳定性。


---

# 十二、状态

QA-057完成。
