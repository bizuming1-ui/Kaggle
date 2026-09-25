# QA-060

# ViiTorVoice Voice Clone Prompt Cache设计方案确认


## 一、问题背景

Qwen3-TTS声音克隆流程：

Reference Audio

↓

Speaker Encoder

↓

Voice Embedding

↓

TTS生成


每次运行重复计算：

- 参考音频分析；
- Speaker特征；
- Prompt准备。


导致：

- 首音频延迟增加；
- GPU重复消耗。


---

# 二、具体提问

如何设计Voice Clone Prompt Cache系统，提高克隆语音启动速度，同时保持音色一致性？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Persistent Voice Clone Prompt Cache（推荐）


---

# 五、整体架构


Reference Audio


↓

Voice Clone Encoder


↓

Cache Builder


↓

Versioned Prompt Cache


↓

Qwen3-TTS Worker


---

# 六、缓存内容


## Speaker Embedding


保存：

说话人音色特征。


---

## Style Embedding


保存：

说话风格特征。


---

## Voice Prompt


保存：

TTS输入相关提示。


---

## Prosody参数


保存：

- 语速；
- 停顿；
- 韵律。


---

# 七、缓存流程


第一次：


参考音频


↓

Encoder分析


↓

生成Cache


↓

保存Dataset



后续：


读取Cache


↓

直接进入TTS


---

# 八、双T4支持


设计：

共享版本化Cache。


避免：

两个GPU重复计算。


---

# 九、Dataset恢复


保存：

- Cache文件；
- 版本信息；
- 配置。


Kaggle重启后：

直接恢复。


---

# 十、方案B


每次重新计算参考音频。


优势：

简单。


缺点：

首音频延迟高。


---

# 十一、方案C


只保存音频文件。


优势：

简单。


缺点：

无法保存模型特征。


---

# 十二、最终技术路线


采用：

Persistent Voice Clone Prompt Cache。


---

# 十三、验证要求


测试：

- 首次加载时间；
- Cache命中速度；
- 音色一致性；
- 双GPU共享；
- 长时间运行。


---

# 十四、状态

QA-060完成。
