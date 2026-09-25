# QA-077

# ViiTorVoice全系统安全测试与自动化回归测试方案确认


## 一、问题背景

ViiTorVoice持续开发过程中：

代码修改可能导致：

- 已有功能损坏；
- 性能下降；
- 音质降低；
- 稳定性下降。


需要建立自动化测试系统。


---

# 二、具体提问

如何设计ViiTorVoice持续验证系统，使每次代码提交后自动测试功能、性能、音质和稳定性？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## AI Assisted Continuous Validation Pipeline（推荐）


---

# 五、整体架构


Git Commit


↓

CI Runner


↓

Test Suite


↓

Benchmark


↓

Quality Gate


↓

Release


---

# 六、CI Runner


触发：

代码提交后自动执行测试。


---

# 七、Test Suite


包含：


## 功能测试


验证：

- LLM输出；
- TTS生成；
- 音频播放。


---

## 集成测试


验证：

模块连接：

- LLM；
- Segmenter；
- TTS；
- Audio Runtime。


---

# 八、Benchmark


测试：

性能指标。


包括：

- TTFA；
- 延迟；
- GPU利用率。


---

# 九、Audio Quality Test


检测：

- Speaker Similarity；
- MOS；
- 韵律。


---

# 十、Stability Test


测试：

- 长时间运行；
- 故障恢复。


---

# 十一、Quality Gate


判断：

是否允许发布。


规则：

测试通过：

↓

Release


测试失败：

↓

阻止合并。


---

# 十二、方案B


手动测试。


优势：

简单。


缺点：

容易遗漏。


---

# 十三、方案C


只运行单元测试。


优势：

速度快。


缺点：

无法发现系统级问题。


---

# 十四、最终技术路线


采用：

AI Assisted Continuous Validation Pipeline。


---

# 十五、验证要求


测试：

- 自动触发；
- 测试覆盖；
- 报告生成；
- 发布保护。


---

# 十六、状态

QA-077完成。
