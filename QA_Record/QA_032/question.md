# QA-032

# ViiTorVoice Qwen3-TTS单片段推理优化方案确认


## 一、问题背景

ViiTorVoice需要优化：

文本Segment

↓

Qwen3-TTS

↓

PCM音频


目标：

降低单片段生成延迟。


---

# 二、具体提问

如何优化Qwen3-TTS单片段推理速度，同时保持音质和音色稳定？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## PyTorch Compile + CUDA Graph + Static Shape Optimization（推荐）


流程：


Qwen3-TTS Model

↓

torch.compile

↓

CUDA Graph Capture

↓

Kernel优化

↓

Tensor优化

↓

PCM输出


---

# 五、优化内容


## 1. torch.compile


作用：

优化PyTorch执行图。


减少：

- Python调度；
- 算子调用。


---

## 2. CUDA Graph


作用：

提前捕获GPU执行流程。


减少：

- CUDA Kernel Launch开销；
- CPU-GPU同步。


---

## 3. Static Shape


固定：

- 输入长度；
- Tensor结构。


提高：

CUDA Graph复用率。


---

# 六、方案B


## 增加Batch Size


优势：

吞吐增加。


缺点：

实时延迟增加。


不适合：

实时语音。


---

# 七、方案C


## FP16降低精度


优势：

简单。


缺点：

可能影响：

- 音质；
- 稳定性。


---

# 八、最终技术路线


采用：


PyTorch Compile

↓

CUDA Graph

↓

Qwen3-TTS Worker


结合：

双T4 GPU。


---

# 九、验证要求


测试：


- 单Segment耗时；
- GPU利用率；
- 音质变化；
- 首音频延迟。


---

# 十、状态

QA-032完成。
