# QA-104

# ViiTorVoice Core Runtime模型加载与推理生命周期设计方案确认


## 一、问题背景

ViiTorVoice进入Core Runtime开发阶段。


需要解决：

- 模型加载；
- GPU常驻；
- 推理管理；
- 版本切换；
- 异常恢复。


---

# 二、具体提问

如何设计ViiTorVoice统一模型运行时管理系统，使模型能够高效加载、常驻GPU并稳定执行推理？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Model Runtime Manager（推荐）


---

# 五、整体架构


Model Registry


↓

Runtime Manager


↓

GPU Memory Manager


↓

Inference Engine


↓

Response


---

# 六、Model Registry


负责：

管理：

- 模型版本；
- 模型路径；
- 模型元数据。


---

# 七、Runtime Manager


负责：

统一控制：

- 加载；
- 卸载；
- 切换；
- 生命周期。


---

# 八、GPU Memory Manager


负责：

管理：

- GPU显存；
- 模型驻留；
- 内存释放。


---

# 九、Inference Engine


负责：

执行：

- TTS推理；
- Speaker Encoder推理；
- Voice Clone生成。


---

# 十、启动生命周期


流程：


Program Start


↓

Environment Check


↓

Load Model


↓

Move GPU


↓

Warmup


↓

Ready


---

# 十一、运行生命周期


Request


↓

Get Model Instance


↓

Inference


↓

Release Resource


---

# 十二、方案B


每个接口独立加载模型。


优势：

简单。


缺点：

- 启动慢；
- 显存浪费。


---

# 十三、方案C


使用全局变量保存模型。


优势：

实现简单。


缺点：

扩展能力差。


---

# 十四、最终技术路线


采用：

Model Runtime Manager。


---

# 十五、验证要求


测试：

- 模型加载速度；
- GPU显存稳定；
- 多请求推理；
- 模型切换；
- 异常恢复。


---

# 十六、状态

QA-104完成。
