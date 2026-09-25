# QA-063

# ViiTorVoice双T4语音一致性与任务同步方案确认


## 一、问题背景

双T4并行生成语音时：

不同GPU Worker可能产生：

- 音色差异；
- 风格变化；
- 韵律不一致。


需要建立一致性控制层。


---

# 二、具体提问

如何设计双GPU语音生成一致性系统，使两个T4 Worker保持相同声音效果？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Deterministic Dual-GPU Voice Consistency Layer（推荐）


---

# 五、整体架构


Master Voice State


↓

Prompt Cache


↓

Shared Config


↓

----------------


GPU0 Worker


GPU1 Worker


----------------


↓

Consistency Checker


---

# 六、Master Voice State


统一保存：

- Voice Clone状态；
- 模型版本；
- 推理配置。


---

# 七、Prompt Cache共享


保证：

两个GPU使用：

同一Speaker Embedding。


---

# 八、Shared Config


固定：

- Sampling参数；
- Seed；
- Prosody参数；
- 生成策略。


---

# 九、Consistency Checker


检测：

- 音色偏差；
- 韵律变化；
- 输出质量。


---

# 十、方案B


每个GPU独立加载模型。


优势：

简单。


缺点：

容易产生：

- Cache不同步；
- 参数差异。


---

# 十一、方案C


单GPU生成。


优势：

一致性最高。


缺点：

无法充分利用双T4。


---

# 十二、最终技术路线


采用：

Deterministic Dual-GPU Voice Consistency Layer。


---

# 十三、验证要求


测试：

- 双GPU输出比较；
- Embedding相似度；
- 音质评分；
- 长时间一致性。


---

# 十四、状态

QA-063完成。
