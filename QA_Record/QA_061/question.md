# QA-061

# ViiTorVoice参考音频质量增强方案确认


## 一、问题背景

声音克隆效果高度依赖参考音频质量。


参考音频中的：

- 噪声；
- 静音；
- 音量变化；
- 环境声音；

会影响：

- 音色；
- 语气；
- 风格；
- 韵律。


---

# 二、具体提问

如何自动优化参考音频，使Qwen3-TTS能够获得更高质量声音克隆效果？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Reference Audio Enhancement Pipeline（推荐）


---

# 五、整体流程


Raw Reference Audio


↓

Quality Analyzer


↓

Denoise


↓

Voice Activity Detection


↓

Best Segment Selector


↓

Speaker Embedding


↓

Qwen3-TTS


---

# 六、Quality Analyzer


分析：


## SNR


判断：

信噪比。


---

## Noise Level


检测：

背景噪声。


---

## Silence Ratio


检测：

无效静音比例。


---

## Volume Stability


检测：

音量变化。


---

## Speech Length


判断：

有效语音长度。


---

## Clarity


判断：

语音清晰度。


---

# 七、Denoise


作用：

降低：

- 环境噪声；
- 电流声；
- 背景声音。


---

# 八、VAD


作用：

检测：

有效语音区域。


去除：

- 空白；
- 无声音部分。


---

# 九、Best Segment Selector


自动选择：

质量最高的参考片段。


---

# 十、方案B


直接使用原始参考音频。


优势：

简单。


缺点：

容易受到环境影响。


---

# 十一、方案C


人工处理参考音频。


优势：

质量可控。


缺点：

无法自动化。


---

# 十二、最终技术路线


采用：

Reference Audio Enhancement Pipeline。


---

# 十三、验证要求


测试：

- 音色一致性；
- 参考音频评分；
- Embedding稳定性；
- TTS输出质量。


---

# 十四、状态

QA-061完成。
