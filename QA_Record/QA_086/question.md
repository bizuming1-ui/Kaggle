# QA-086

# ViiTorVoice实时音频传输与播放同步架构设计方案确认


## 一、问题背景

ViiTorVoice采用Streaming TTS后：

音频流程：

TTS生成PCM

↓

传输

↓

播放


过程中可能出现：

- 网络延迟；
- PCM不足；
- 播放断裂；
- GAP。


需要设计实时音频同步系统。


---

# 二、具体提问

ViiTorVoice实时语音播放是否采用Ring Buffer结合WebAudio Timeline的方案，保证低延迟连续播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Ring Buffer + WebAudio Timeline（推荐）


---

# 五、整体架构


TTS Worker


↓

PCM Stream


↓

Ring Buffer


↓

Two Ahead Buffer


↓

WebAudio Scheduled Playback


↓

Speaker


---

# 六、TTS Worker


负责：

生成：

Streaming PCM。


输出：

连续音频Chunk。


---

# 七、PCM Stream


负责：

实时传输：

音频数据。


特点：

不等待完整文件。


---

# 八、Ring Buffer


作用：

缓存PCM。


解决：

- 生产速度波动；
- 播放速度波动。


---

# 九、Two Ahead Buffer


策略：

提前准备：

未来两个音频片段。


作用：

降低：

播放中断风险。


---

# 十、WebAudio Timeline


负责：

精确调度播放时间。


保证：

PCM连续。


---

# 十一、解决问题


解决：

## GAP


音频间断。


---

## Underrun


Buffer不足。


---

## 卡顿


播放不连续。


---

# 十二、方案B


生成完整音频文件后播放。


优势：

简单。


缺点：

延迟高。


---

# 十三、方案C


PCM生成立即播放。


优势：

延迟低。


缺点：

无缓冲保护。


---

# 十四、最终技术路线


采用：

Ring Buffer + WebAudio Timeline。


---

# 十五、验证要求


测试：

- 首音频延迟；
- Buffer稳定；
- 长时间播放；
- GAP次数。


---

# 十六、状态

QA-086完成。
