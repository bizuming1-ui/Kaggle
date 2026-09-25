# QA-083

# ViiTorVoice实时语音克隆核心实现路线调整确认


## 一、问题背景

之前规划包含：

- Memory MCP；
- AI Agent；
- 知识管理；
- 自动优化系统。


但是当前核心目标：

实现实时语音克隆功能。


需要优先完成：

模型推理；

声音克隆；

实时播放。


---

# 二、具体提问

是否暂时停止MCP等外围系统设计，只实现ViiTorVoice实时语音克隆核心功能？


---

# 三、用户选择

选择：

A


---

# 四、调整后的开发方向


停止：

- MCP设计；
- Memory系统；
- AI Agent系统。


优先：

ViiTorVoice实时语音克隆。


---

# 五、核心数据流


用户声音样本


↓

Voice Encoder


↓

Speaker Embedding


↓

Qwen3-TTS


↓

Streaming PCM


↓

Rust Buffer


↓

WebAudio Timeline


↓

实时播放


---

# 六、核心指标


## 声音质量


验证：

- Speaker Similarity；
- 音色保持。


---

## 实时性能


验证：

- TTFA；
- RTF；
- 延迟。


---

## 播放稳定性


验证：

- Buffer；
- GAP；
- underrun。


---

## GPU性能


验证：

- T4利用率；
- 显存；
- 推理速度。


---

# 七、后续问题范围


仅围绕：

- Qwen3-TTS；
- Voice Clone；
- Streaming；
- GPU优化；
- Audio Pipeline；
- Kaggle部署。


---

# 八、状态

QA-083完成。
