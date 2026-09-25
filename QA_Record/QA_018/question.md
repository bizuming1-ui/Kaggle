# QA-018

# ViiTorVoice Qwen3-TTS推理精度与速度优化方案确认


## 一、问题背景

ViiTorVoice目标：

在Kaggle双T4环境中运行Qwen3-TTS-1.7B。


要求：

- 保持高质量声音克隆；
- 降低TTS推理时间；
- 提高实时生成速度；
- 不破坏音色和韵律。


---

# 二、具体提问

Qwen3-TTS-1.7B在NVIDIA T4 GPU环境下，应该采用什么推理精度和优化方式，才能兼顾速度和音质？


---

# 三、方案A

## FP16 + CUDA Graph + torch.compile（推荐）


流程：


Qwen3-TTS-1.7B

↓

FP16推理

↓

torch.compile编译优化

↓

CUDA Graph固定计算图

↓

TTS Worker生成PCM


优化目标：

1.

减少CUDA kernel启动开销。

2.

提高GPU利用率。

3.

降低单次推理延迟。

4.

保持声音质量。


优势：

- NVIDIA T4支持；
- 音质损失较小；
- 适合实时语音。


---

# 四、方案B

## INT8量化


流程：

FP16模型

↓

INT8量化


优势：

- 显存降低；
- 部分情况下速度提高。


缺点：

- 需要重新验证音色；
- 可能影响生成质量。


---

# 五、方案C

## FP32最高精度


优势：

理论精度最高。


缺点：

- GPU压力大；
- 推理速度慢；
- 不适合实时流式。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

FP16 + torch.compile + CUDA Graph。


结合：

GPU0

↓

Qwen3-TTS Worker

↓

PCM

↓

Rust Runtime


---

# 八、开发要求


必须测试：

- FP16音质；
- FP16速度；
- CUDA Graph收益；
- torch.compile收益；
- 长时间稳定性。


---

# 九、验证标准


必须确认：

- 音色无明显变化；
- 推理速度提升；
- GPU利用率提高；
- 无稳定性问题。


---

# 十、状态

QA-018完成。
