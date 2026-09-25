# QA-121

# ViiTorVoice MVP第一阶段开发边界确认


## 一、问题背景

ViiTorVoice需要确定第一阶段开发范围。


目标：

优先完成核心实时语音克隆能力。


---

# 二、具体提问

第一阶段应该实现哪些核心功能，避免过早扩展复杂系统？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Core Real-Time Voice Clone MVP


---

# 五、核心链路


Text Input


↓

Speaker Embedding


↓

Streaming TTS


↓

PCM Stream


↓

Rust Audio Engine


↓

WebAudio Playback


---

# 六、包含功能


## 输入层

文本输入。


## 声音层

Speaker Embedding。


## 推理层

Streaming TTS。


## 音频层

PCM实时传输。


## 播放层

WebAudio实时播放。


---

# 七、暂不包含


- 商业账号系统；
- 大规模用户管理；
- 完整云部署；
- 复杂运营功能。


---

# 八、开发原则


先完成：

实时语音克隆闭环。


再逐步扩展：

平台化能力。


---

# 九、方案B


直接开发完整商业平台。


缺点：

开发周期长。


---

# 十、方案C


只做模型测试。


缺点：

无法验证完整系统。


---

# 十一、最终技术路线


采用：

Core Real-Time Voice Clone MVP。


---

# 十二、验证要求


测试：

- 文本输入；
- 声音克隆；
- Streaming输出；
- 实时播放。


---

# 十三、状态

QA-121完成。
