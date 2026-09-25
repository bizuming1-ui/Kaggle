# QA-097

# ViiTorVoice多语言语音克隆扩展架构设计方案确认


## 一、问题背景

未来ViiTorVoice需要支持：

- 中文；
- English；
- 日本語；
- 한국어；
- 其他语言。


目标：

保持同一个声音身份，

实现跨语言语音克隆。


---

# 二、具体提问

如何设计ViiTorVoice多语言Voice Clone系统，使一个Speaker Embedding能够支持不同语言自然发音？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Multilingual Voice Clone Pipeline（推荐）


---

# 五、整体架构


Text


↓

Language ID


↓

G2P / Phoneme


↓

Multilingual TTS


↓

Speaker Embedding


↓

Streaming Audio


---

# 六、Language ID


功能：

自动检测输入语言。


例如：

中文文本：

进入中文处理。


English文本：

进入英文处理。


---

# 七、G2P / Phoneme


作用：

将文字转换：

标准发音表示。


优势：

减少不同文字系统差异。


---

# 八、Multilingual TTS


负责：

不同语言语音生成。


支持：

多语言声学建模。


---

# 九、Speaker Embedding


作用：

保持：

- 音色；
- 声纹；
- 说话风格。


---

# 十、Streaming Audio


输出：

实时：

PCM Audio。


---

# 十一、方案B


每种语言独立模型。


优势：

语言优化程度高。


缺点：

模型数量增加。


---

# 十二、方案C


只支持单语言。


优势：

实现简单。


缺点：

无法扩展。


---

# 十三、最终技术路线


采用：

Multilingual Voice Clone Pipeline。


---

# 十四、验证要求


测试：

- 多语言声音相似度；
- 发音准确度；
- Streaming延迟；
- Speaker一致性。


---

# 十五、状态

QA-097完成。
