# QA-052

# ViiTorVoice CUDA Graph与PyTorch编译优化方案确认


## 一、问题背景

Qwen3-TTS实时生成过程中：

Python

↓

PyTorch

↓

CUDA Kernel

↓

GPU


存在：

- Kernel启动开销；
- Python调度延迟；
- GPU等待；
- 推理时间波动。


需要优化GPU执行效率。


---

# 二、具体提问

如何使用PyTorch编译技术和CUDA Graph优化Qwen3-TTS推理速度，同时保持已有功能稳定？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## PyTorch 2.x + torch.compile + CUDA Graph（推荐）


---

# 五、整体流程


PyTorch Model


↓

Warmup


↓

torch.compile


↓

CUDA Graph Capture


↓

Static Shape Inference


↓

CUDA Replay


↓

Audio Output


---

# 六、Warmup阶段


作用：

提前运行模型。


准备：

- CUDA Kernel；
- 显存分配；
- 执行路径。


---

# 七、torch.compile


作用：

优化：

- PyTorch计算图；
- Kernel融合；
- 执行效率。


---

# 八、CUDA Graph


作用：

固定重复执行流程。


减少：

- Kernel launch；
- CPU-GPU同步。


---

# 九、Static Shape设计


目标：

保证：

- 输入尺寸稳定；
- Graph可以复用。


---

# 十、方案B


只使用torch.compile。


优势：

简单。


缺点：

CUDA调度优化不足。


---

# 十一、方案C


手写CUDA/C++ Runtime。


优势：

理论性能最高。


缺点：

开发维护成本高。


---

# 十二、最终技术路线


采用：

PyTorch 2.x

+

torch.compile

+

CUDA Graph。


---

# 十三、验证要求


测试：

- 单片段TTS耗时；
- GPU利用率；
- 显存变化；
- 首音频延迟；
- 长时间稳定性。


---

# 十四、状态

QA-052完成。
