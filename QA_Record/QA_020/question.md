# QA-020

# ViiTorVoice Reference Audio参考音频优化方案确认


## 一、问题背景

ViiTorVoice需要使用Qwen3-TTS-1.7B实现声音克隆。


参考音频质量直接影响：

- 音色保持；
- 发音方式；
- 语气；
- 呼吸感；
- 韵律。


如果参考音频存在：

- 环境噪声；
- 音量过低；
- 回声；
- 长时间静音；

会降低Speaker Embedding质量。


---

# 二、具体提问

如何处理参考音频，才能提高声音克隆质量，并让Qwen3-TTS获得更稳定、更自然的人声特征？


---

# 三、方案A

## Reference Audio Preprocessing Pipeline（推荐）


流程：


原始参考音频

↓

自动预处理


处理内容：


## 1. 静音检测

自动删除：

- 开头空白；
- 结尾空白；
- 长时间无声音区域。


---

## 2. 音量标准化

统一：

- RMS音量；
- 音频动态范围。


避免：

输入音量变化影响模型。


---

## 3. 降噪

减少：

- 环境噪声；
- 电流声；
- 背景声音。


---

## 4. 采样率统一

转换为模型需要的采样率。


保证：

输入格式一致。


---

## 5. 音频质量评分


记录：

- SNR；
- 清晰度；
- 有效语音比例。


生成：

metadata.json


---

# 四、方案B

## 直接使用原始参考音频


优势：

简单。


缺点：

容易受到：

- 噪声；
- 音量；
- 环境影响。


---

# 五、方案C

## 人工手动剪辑


优势：

可以精细控制。


缺点：

- 无法自动化；
- 不适合长期系统。


---

# 六、用户选择

选择：

A


---

# 七、最终技术路线


采用：

Reference Audio Preprocessing Pipeline。


完整流程：


Reference Audio

↓

Audio Quality Analyzer

↓

Preprocessor

↓

Speaker Encoder

↓

Voice Clone Prompt Cache

↓

Qwen3-TTS-1.7B


---

# 八、开发要求


必须实现监测：

- 输入音频质量评分；
- 预处理耗时；
- Speaker Embedding生成耗时；
- Cache生成状态。


---

# 九、验证标准


必须确认：

- 同一参考音频Embedding稳定；
- 音色保持提升；
- 克隆语音更加自然。


---

# 十、状态

QA-020完成。
