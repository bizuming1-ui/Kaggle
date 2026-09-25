# QA-118

# ViiTorVoice Fault Recovery异常恢复设计方案确认


## 一、问题背景

ViiTorVoice需要支持长期稳定运行。


运行过程中可能出现：

- GPU错误；
- 模型异常；
- 网络断开；
- 音频中断。


---

# 二、具体提问

如何设计ViiTorVoice自动故障恢复系统，使服务出现异常后能够自动恢复运行？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Automatic Fault Recovery Manager


---

# 五、整体流程


Error Detect


↓

Fault Analyzer


↓

Recovery Action


↓

Runtime Resume


---

# 六、故障检测


检测：

- GPU异常；
- Runtime错误；
- 网络断开；
- Audio Stream异常。


---

# 七、Fault Analyzer


负责：

判断：

- 错误类型；
- 恢复策略。


---

# 八、Recovery Action


包括：


## Runtime恢复

重新启动Worker。


## Model恢复

重新加载模型。


## Connection恢复

重新建立连接。


## Session恢复

恢复用户状态。


---

# 九、优势


实现：

- 自动恢复；
- 减少人工干预；
- 提高稳定性。


---

# 十、方案B


人工重启。


缺点：

无法无人值守。


---

# 十一、方案C


只记录日志。


缺点：

不能恢复。


---

# 十二、最终技术路线


采用：

Automatic Fault Recovery Manager。


---

# 十三、验证要求


测试：

- GPU异常；
- 模型错误；
- 网络断开；
- 长时间运行恢复。


---

# 十四、状态

QA-118完成。
