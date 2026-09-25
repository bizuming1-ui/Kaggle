# QA-067

# ViiTorVoice CUDA Graph + PyTorch编译优化方案确认


## 一、问题背景

Qwen3-TTS实时推理过程中：

存在：

- CUDA Kernel启动开销；
- Python调度开销；
- 动态shape重复编译；
- GPU等待。


需要优化推理执行路径。


---

# 二、具体提问

如何使用PyTorch编译和CUDA Graph技术，提高Qwen3-TTS在双T4上的实时推理性能？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## PyTorch Compile + CUDA Graph Hybrid Optimization（推荐）


---

# 五、整体架构


Qwen3-TTS


↓

torch.compile


↓

Graph Capture


↓

CUDA Graph Replay


↓

T4 Tensor Core


---

# 六、torch.compile优化


作用：

优化：

- PyTorch计算图；
- Kernel组合；
- 执行效率。


减少：

Python层调度。


---

# 七、CUDA Graph优化


作用：

提前捕获GPU执行流程。


运行时：

直接Replay。


减少：

- Kernel Launch；
- CPU-GPU同步。


---

# 八、实时TTS优化目标


优化：

## 单片段推理


降低：

每个音频片段生成时间。


---

## 首次推理延迟


降低：

模型启动后的第一次响应时间。


---

## GPU利用率


提高：

T4 Tensor Core利用。


---

# 九、双T4适配


要求：

GPU Worker分别维护：

- CUDA Context；
- Graph Cache；
- 编译结果。


避免：

跨GPU状态冲突。


---

# 十、方案B


只使用torch.compile。


优势：

简单。


缺点：

实时优化有限。


---

# 十一、方案C


手写CUDA Kernel。


优势：

理论性能最高。


缺点：

开发复杂度高。


---

# 十二、最终技术路线


采用：

PyTorch Compile + CUDA Graph Hybrid Optimization。


---

# 十三、验证要求


测试：

- TTFA；
- 单片段TTS延迟；
- GPU利用率；
- 长时间稳定性；
- 输出音质一致性。


---

# 十四、状态

QA-067完成。
