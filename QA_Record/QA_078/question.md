# QA-078

# ViiTorVoice模型热更新与零停机升级系统设计方案确认


## 一、问题背景

ViiTorVoice持续优化需要升级：

- Qwen3-TTS；
- DeepSeek；
- Voice Encoder；
- 推理模块。


传统升级：

停止服务

↓

替换模型

↓

重新启动


会造成：

- 用户中断；
- Session丢失；
- 服务不可用。


需要实现零停机升级。


---

# 二、具体提问

如何设计ViiTorVoice模型热更新系统，使模型升级过程中保持语音服务连续？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Zero-Downtime Model Deployment System（推荐）


---

# 五、整体架构


Model Registry


↓

Deployment Manager


↓

Shadow Worker


↓

Validation


↓

Traffic Router


↓

Production Worker


---

# 六、Model Registry


保存：

- 模型版本；
- 配置版本；
- 发布记录。


支持：

版本追踪。


---

# 七、Deployment Manager


负责：

- 加载新模型；
- 创建Worker；
- 管理升级流程。


---

# 八、Shadow Worker


作用：

后台运行新版本。


不影响：

当前用户。


---

# 九、Validation


验证：

- 推理成功；
- 延迟；
- 音质；
- 稳定性。


---

# 十、Traffic Router


负责：

切换：

旧版本

↓

新版本。


---

# 十一、Rollback


如果新版本失败：

自动恢复：

旧模型。


---

# 十二、方案B


停止服务后升级。


优势：

简单。


缺点：

用户中断。


---

# 十三、方案C


直接覆盖旧模型文件。


优势：

速度快。


缺点：

风险最高。


---

# 十四、最终技术路线


采用：

Zero-Downtime Model Deployment System。


---

# 十五、验证要求


测试：

- 模型切换；
- Session连续性；
- 自动回滚；
- 服务稳定性。


---

# 十六、状态

QA-078完成。
