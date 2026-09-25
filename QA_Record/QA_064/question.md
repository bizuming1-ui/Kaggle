# QA-064

# ViiTorVoice音频质量自动评估系统设计方案确认


## 一、问题背景

语音克隆系统优化过程中：

仅依靠人工试听：

存在：

- 主观差异；
- 无法批量比较；
- 无法定位问题。


需要建立自动音频质量分析系统。


---

# 二、具体提问

如何设计自动化音频质量监控系统，对每次ViiTorVoice优化版本进行量化比较？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Multi-Metric Audio Quality Evaluation System（推荐）


---

# 五、整体架构


Audio Output


↓

Feature Extractor


↓

Quality Metrics


↓

Score Fusion


↓

Quality Report


↓

Optimization Loop


---

# 六、Feature Extractor


提取：

- 音频特征；
- 频谱；
- 音量；
- 说话特征。


---

# 七、Quality Metrics


## Speaker Similarity


检测：

克隆声音与目标声音相似程度。


---

## MOS预测


预测：

自然度评分。


---

## SNR


检测：

信噪比。


---

## PESQ


评估：

语音质量。


---

## STOI


评估：

语音可懂度。


---

## Prosody Score


评估：

- 节奏；
- 停顿；
- 韵律。


---

# 八、Score Fusion


综合：

多个指标。


生成：

统一质量分数。


---

# 九、Optimization Loop


流程：


版本A


vs


版本B


↓

自动分析


↓

生成报告


↓

指导优化。


---

# 十、方案B


人工试听。


优势：

接近实际体验。


缺点：

无法自动化。


---

# 十一、方案C


只检测波形。


优势：

简单。


缺点：

无法判断人声自然度。


---

# 十二、最终技术路线


采用：

Multi-Metric Audio Quality Evaluation System。


---

# 十三、验证要求


测试：

- 自动评分；
- 版本比较；
- 长时间统计；
- 优化反馈。


---

# 十四、状态

QA-064完成。
