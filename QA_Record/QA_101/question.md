# QA-101

# ViiTorVoice工程实现顺序与开发路线设计方案确认


## 一、问题背景

前面完成：

- 系统架构设计；
- Streaming设计；
- GPU设计；
- Rust音频层；
- 多用户设计；
- 部署设计。


下一步需要进入实际工程开发。


---

# 二、具体提问

如何安排ViiTorVoice实际开发顺序，降低开发风险，并保证每个阶段都可以验证？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 自底向上工程路线（推荐）


---

# 五、整体路线


Core AI


↓

Streaming Engine


↓

Service API


↓

Frontend


↓

Production System


---

# 六、Phase 1

## Core AI Runtime


实现：

- TTS Runtime；
- Speaker Encoder；
- Voice Clone推理；
- Streaming输出。


目标：

首先验证核心声音生成能力。


---

# 七、Phase 2

## Realtime Streaming Engine


实现：

- WebSocket；
- Rust Audio Engine；
- Ring Buffer；
- WebAudio。


目标：

实现实时播放。


---

# 八、Phase 3

## Service Platform


实现：

- API Gateway；
- Session Manager；
- Multi User；
- Benchmark；
- Recovery。


目标：

形成服务系统。


---

# 九、Phase 4

## Production System


实现：

- Model Registry；
- 自动部署；
- Rollback；
- 长时间运行。


---

# 十、方案B


先开发完整UI。


优势：

快速看到界面。


缺点：

底层能力未验证。


---

# 十一、方案C


先开发部署系统。


优势：

部署框架提前完成。


缺点：

核心功能没有验证。


---

# 十二、最终技术路线


采用：

自底向上工程路线。


---

# 十三、验证要求


每个阶段：

- 独立运行；
- 自动测试；
- 保存版本；
- 可回滚。


---

# 十四、状态

QA-101完成。
