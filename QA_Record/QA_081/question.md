# QA-081

# ViiTorVoice模块化插件系统设计方案确认


## 一、问题背景

ViiTorVoice未来需要持续增加：

- 新LLM；
- 新TTS模型；
- 新Audio Backend；
- 新优化算法。


如果直接修改核心代码：

会导致：

- 核心复杂化；
- 维护困难；
- 升级风险增加。


需要建立插件架构。


---

# 二、具体提问

如何设计ViiTorVoice插件系统，使新功能可以独立扩展，同时保持核心Runtime稳定？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Universal Voice Plugin Framework（推荐）


---

# 五、整体架构


Plugin Registry


↓

Plugin Manager


↓

Interface Layer


↓

Core Runtime


↓

Plugin Instance


---

# 六、Plugin Registry


负责：

保存：

- 插件名称；
- 版本；
- 类型；
- 依赖。


---

# 七、Plugin Manager


负责：

- 插件加载；
- 插件卸载；
- 生命周期管理。


---

# 八、Interface Layer


定义统一接口。


保证：

不同插件能够连接核心Runtime。


---

# 九、Core Runtime


保持：

稳定。


不直接依赖：

具体模型实现。


---

# 十、LLM Plugin


支持：

- DeepSeek；
- Qwen；
- 其他LLM。


---

# 十一、TTS Plugin


支持：

- Qwen3-TTS；
- 新语音模型。


---

# 十二、Audio Plugin


支持：

- WebAudio；
- Native Audio。


---

# 十三、Optimization Plugin


支持：

- 新调度算法；
- 新优化策略。


---

# 十四、插件能力


支持：

## 动态加载


运行时加载插件。


---

## 版本管理


记录：

插件版本。


---

## 插件隔离


防止：

插件错误影响核心。


---

## 自动检测


检测：

- 依赖；
- 兼容性。


---

# 十五、方案B


直接修改核心代码。


优势：

简单。


缺点：

长期维护困难。


---

# 十六、方案C


每个功能独立项目。


优势：

隔离。


缺点：

集成复杂。


---

# 十七、最终技术路线


采用：

Universal Voice Plugin Framework。


---

# 十八、验证要求


测试：

- 插件加载；
- 插件卸载；
- 版本兼容；
- 核心稳定性。


---

# 十九、状态

QA-081完成。
