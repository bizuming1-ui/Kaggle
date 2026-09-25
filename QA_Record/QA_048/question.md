# QA-048

# ViiTorVoice Voice Clone Prompt Cache设计方案确认


## 一、问题背景

语音克隆流程：

参考音频

↓

Speaker Embedding

↓

Voice Clone Prompt

↓

Qwen3-TTS


如果每次生成都重新计算参考音频特征，会造成：

- 首次响应慢；
- GPU计算重复；
- TTS启动延迟增加。


---

# 二、具体提问

如何设计Voice Clone Prompt缓存系统，提高Qwen3-TTS语音克隆速度并保持音色一致？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Persistent Voice Clone Prompt Cache（推荐）


---

# 五、整体流程


Reference Audio


↓

Audio Enhancement


↓

Speaker Encoder


↓

Prompt Embedding


↓

Cache Storage


↓

Qwen3-TTS加载


---

# 六、缓存内容


保存：


## Speaker Embedding


作用：

保存说话人特征。


---

## Acoustic Prompt


作用：

保存声音风格信息。


---

## Metadata


记录：

- 创建时间；
- 参数；
- 音频信息。


---

## Model Version


记录：

使用的模型版本。


---

## Checksum


作用：

验证缓存完整性。


---

# 七、优势


减少：

- 首个TTS请求延迟；
- GPU重复计算。


提高：

- 音色一致性；
- 生成速度。


---

# 八、Kaggle持久化设计


Prompt Cache保存到：

Dataset Snapshot。


恢复后：

直接加载。


---

# 九、方案B


每次重新计算。


优势：

实现简单。


缺点：

速度慢。


---

# 十、方案C


只缓存参考音频。


优势：

简单。


缺点：

仍需要重新提取Embedding。


---

# 十一、最终技术路线


采用：

Persistent Voice Clone Prompt Cache。


结合：

Kaggle Dataset固化恢复。


---

# 十二、验证要求


测试：

- Cache命中速度；
- 首TTS延迟；
- 音色一致性；
- 多次生成稳定性。


---

# 十三、状态

QA-048完成。
