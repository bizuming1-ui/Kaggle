# QA-102

# ViiTorVoice Phase 1 Core AI Runtime技术栈选择方案确认


## 一、问题背景

ViiTorVoice进入实际工程开发阶段。


需要确定：

- AI框架；
- GPU优化方式；
- 实时音频技术；
- 前端技术。


---

# 二、具体提问

如何选择ViiTorVoice核心Runtime技术栈，使系统同时满足AI开发效率、GPU性能和实时音频低延迟需求？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Python + PyTorch + CUDA/C++ + Rust混合架构（推荐）


---

# 五、整体架构


ViiTorVoice


├── Python AI Runtime


├── CUDA/C++ GPU Layer


├── Rust Audio Engine


├── TypeScript Frontend


└── Tests


---

# 六、Python职责


负责：

- 模型加载；
- 推理流程；
- 调度逻辑；
- 实验开发。


优势：

AI生态完善。


---

# 七、PyTorch职责


负责：

- 深度学习计算；
- 模型推理；
- GPU调用。


---

# 八、CUDA/C++职责


负责：

- GPU高性能算子；
- Tensor优化；
- 性能关键路径。


---

# 九、Rust职责


负责：

- 实时PCM处理；
- Ring Buffer；
- 内存管理；
- Streaming。


优势：

低延迟、安全。


---

# 十、TypeScript/Web职责


负责：

- 浏览器客户端；
- WebAudio控制；
- 用户交互。


---

# 十一、方案B


全部Python。


优势：

开发简单。


缺点：

实时性能优化有限。


---

# 十二、方案C


全部C++/Rust。


优势：

性能高。


缺点：

AI开发效率低。


---

# 十三、最终技术路线


采用：

Python + PyTorch + CUDA/C++ + Rust混合架构。


---

# 十四、验证要求


测试：

- GPU性能；
- Streaming延迟；
- 音频稳定；
- 工程维护性。


---

# 十五、状态

QA-102完成。
