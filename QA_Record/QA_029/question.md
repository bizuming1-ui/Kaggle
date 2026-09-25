# QA-029

# ViiTorVoice Qwen3-TTS Voice Clone Prompt Cache设计方案确认


## 一、问题背景

ViiTorVoice使用Qwen3-TTS进行声音克隆。


参考音频处理如果每次重新计算：

会导致：

- 首次响应慢；
- GPU重复计算；
- 连续生成效率降低。


需要缓存声音特征。


---

# 二、具体提问

如何设计Voice Clone Prompt Cache，提高克隆语音生成速度并保持音色一致？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 持久化 Voice Clone Prompt Cache（推荐）


流程：


Reference Audio

↓

Speaker Encoder

↓

Voice Embedding

↓

Prompt Feature Cache

↓

保存


后续请求：


Text

↓

读取Cache

↓

Qwen3-TTS

↓

生成语音


---

# 五、Cache内容


voice_cache/


speaker_embedding.pt


保存：

Speaker音色特征。


---

prompt_features.pt


保存：

TTS需要的声音提示特征。


---

metadata.json


保存：

- 模型版本；
- 采样率；
- 创建时间；
- 参数配置。


---

# 六、优势


1.

减少重复计算。


2.

降低首个TTS请求时间。


3.

保持声音一致。


4.

适合长期Kaggle运行。


---

# 七、方案B


每次重新提取参考音频。


优势：

实现简单。


缺点：

速度慢。


---

# 八、方案C


只缓存模型。


优势：

简单。


缺点：

不能提升Voice Clone速度。


---

# 九、最终技术路线


采用：

Voice Clone Prompt Cache。


结合：


Reference Audio

↓

Speaker Encoder

↓

Cache

↓

Dual T4 Worker

↓

Qwen3-TTS


---

# 十、验证要求


必须测试：

- 首次生成耗时；
- Cache读取耗时；
- 音色一致性；
- 多次生成差异。


---

# 十一、状态

QA-029完成。
