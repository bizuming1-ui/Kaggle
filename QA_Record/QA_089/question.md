# QA-089

# ViiTorVoice声音质量增强与Voice Clone保真优化方案确认


## 一、问题背景

ViiTorVoice目标：

不仅实现语音生成，

还需要保持：

- 用户音色；
- 说话风格；
- 发音特点。


声音链路：

参考声音

↓

Speaker Embedding

↓

TTS生成

↓

输出声音


需要提升克隆保真度。


---

# 二、具体提问

如何优化ViiTorVoice Voice Clone系统，提高声音相似度和自然度？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 多阶段Voice Clone增强方案（推荐）


---

# 五、整体流程


Reference Audio


↓

Speaker Encoder


↓

Embedding Refinement


↓

TTS Conditioning


↓

Audio Enhancement


↓

Final Voice


---

# 六、Speaker Encoder优化


作用：

提取：

- 音色；
- 声纹；
- 说话特征。


目标：

提高Speaker表示质量。


---

# 七、Embedding Refinement


作用：

优化：

Speaker Embedding。


减少：

特征误差。


---

# 八、TTS Conditioning


作用：

将Speaker信息输入TTS。


保证：

生成声音保持目标音色。


---

# 九、Audio Enhancement


处理：

- 采样率；
- 降噪；
- 音频增强。


提升：

最终听感。


---

# 十、质量评价指标


## Speaker Similarity


评价：

声音相似程度。


---

## MOS


评价：

自然度。


---

## Pronunciation Accuracy


评价：

发音准确性。


---

# 十一、方案B


只提高TTS模型参数。


优势：

简单。


缺点：

声音控制能力有限。


---

# 十二、方案C


只进行音频后处理。


优势：

容易实现。


缺点：

无法改善核心音色。


---

# 十三、最终技术路线


采用：

多阶段Voice Clone增强方案。


---

# 十四、验证要求


测试：

- 声音相似度；
- 音质；
- 发音；
- 不同文本稳定性。


---

# 十五、状态

QA-089完成。
