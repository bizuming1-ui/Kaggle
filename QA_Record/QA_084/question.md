# QA-084

# ViiTorVoice Voice Clone推理流水线设计方案确认


## 一、问题背景

ViiTorVoice目标：

实现实时语音克隆。


核心流程：

用户声音

↓

声音特征提取

↓

语音生成

↓

实时播放


需要确定声音克隆初始化方式。


---

# 二、具体提问

实时语音克隆中，是否采用一次参考声音编码并缓存Speaker Embedding的方案？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## 一次参考声音编码 + Speaker Embedding缓存


---

# 五、整体流程


参考声音


↓

Speaker Encoder


↓

Speaker Embedding


↓

缓存


↓

TTS Model


↓

Streaming Audio


---

# 六、参考声音处理


输入：

用户声音样本。


建议：

10～30秒。


处理：

提取：

- 音色特征；
- 说话人特征。


---

# 七、Speaker Embedding缓存


首次：

执行Encoder。


之后：

直接使用缓存。


避免：

每句话重复计算。


---

# 八、实时生成流程


用户输入文本


↓

加载Speaker Embedding


↓

TTS推理


↓

生成PCM


↓

Streaming播放


---

# 九、性能优势


降低：

- TTFA；
- GPU计算；
- 重复编码时间。


提升：

实时交互能力。


---

# 十、方案B


每句话重新编码声音。


优势：

实现简单。


缺点：

- 延迟增加；
- GPU浪费。


---

# 十一、方案C


固定预生成声音。


优势：

速度快。


缺点：

无法自由克隆用户声音。


---

# 十二、最终技术路线


采用：

一次参考声音编码 + Speaker Embedding缓存。


---

# 十三、验证要求


测试：

- 声音相似度；
- 编码耗时；
- TTFA；
- 长时间生成稳定性。


---

# 十四、状态

QA-084完成。
