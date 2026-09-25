# QA-122

# ViiTorVoice正式编码实施计划确认


## 一、问题背景

ViiTorVoice已经完成：

QA-084 ～ QA-121

架构设计确认。


下一步进入实际编码。


---

# 二、具体提问

如何组织ViiTorVoice开发流程，使系统能够稳定实现，并避免架构返工？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 模块化Phase开发


---

# 五、开发路线


## Phase 1

基础工程结构


建立：

- 项目目录；
- 配置系统；
- 测试框架。


---

## Phase 2

Rust Audio Engine


实现：

- PCM Buffer；
- Ring Buffer；
- ABI协议。


---

## Phase 3

Streaming TTS Runtime


实现：

- 推理接口；
- Streaming输出。


---

## Phase 4

WebSocket Streaming


实现：

- Binary Protocol；
- Reconnect。


---

## Phase 5

WebAudio Playback


实现：

- AudioWorklet；
- Timeline播放。


---

## Phase 6

Benchmark测试


实现：

- TTFA；
- RTF；
- 稳定性测试。


---

## Phase 7

Kaggle双T4部署


实现：

- 一键启动；
- GPU检测；
- 服务验证。


---

# 六、开发原则


保持：

- 小步提交；
- 每阶段测试；
- Git版本记录；
- 不破坏已有功能。


---

# 七、方案B


一次性完整开发。


缺点：

风险高。


---

# 八、方案C


只优化模型。


缺点：

无法形成完整系统。


---

# 九、最终技术路线


采用：

模块化Phase开发。


---

# 十、状态

QA-122完成。

架构设计阶段完成。
进入正式编码阶段。
