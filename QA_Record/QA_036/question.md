# QA-036

# ViiTorVoice Voice Clone Prompt Cache设计方案确认


## 一、问题背景

实时声音克隆系统每次生成语音时：

参考音频

↓

Speaker Embedding提取

↓

Voice Prompt计算

↓

TTS生成


会造成：

- 首次响应慢；
- GPU等待；
- 重复计算。


目标：

缓存声音特征，提高实时性能。


---

# 二、具体提问

如何设计Voice Clone Prompt Cache，使Qwen3-TTS快速加载声音特征，同时保证音色一致？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Persistent Voice Prompt Cache + Memory Mapping（推荐）


---

# 五、缓存流程


参考音频

↓

Speaker Encoder

↓

Speaker Embedding

↓

Voice Prompt Cache

↓

保存Dataset


启动：


Dataset恢复

↓

Memory Map读取

↓

GPU加载

↓

TTS直接生成


---

# 六、核心技术


## safetensors保存


作用：

安全保存：

- Tensor；
- Speaker Feature。


---

## mmap读取


作用：

减少：

- 文件复制；
- 内存占用。


提高：

加载速度。


---

## checksum校验


作用：

检测：

Cache是否损坏。


---

## Cache Version管理


作用：

保证：

不同模型版本不会错误使用旧缓存。


---

# 七、方案B


## 每次启动重新计算


优势：

简单。


缺点：

启动时间长。


---

# 八、方案C


## JSON保存参数


优势：

简单。


缺点：

不能保存完整声纹特征。


---

# 九、最终技术路线


采用：


Persistent Cache

+

Memory Mapping

+

Dataset恢复


服务：

Qwen3-TTS实时声音克隆。


---

# 十、验证要求


测试：


- Cache加载时间；
- 首次TTS延迟；
- 音色一致性；
- 双GPU共享效果。


---

# 十一、状态

QA-036完成。
