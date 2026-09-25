# QA-059

# ViiTorVoice TypeScript WebAudio实时播放器架构设计方案确认


## 一、问题背景

实时克隆语音系统需要：

一边生成音频，

一边播放音频。


浏览器播放必须解决：

- 自动播放限制；
- 播放GAP；
- 时钟漂移；
- Buffer不足；
- 网络重连。


---

# 二、具体提问

如何设计TypeScript/WebAudio播放器，实现Rust Runtime输出音频的低延迟稳定播放？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## WebAudio + AudioWorklet + Timeline Scheduler（推荐）


---

# 五、整体架构


Rust Audio Runtime


↓

WebSocket / WebRTC


↓

AudioWorklet


↓

Ring Buffer


↓

Timeline Scheduler


↓

Audio Output


---

# 六、AudioContext Manager


负责：

- 初始化AudioContext；
- 恢复播放状态；
- 管理浏览器限制。


---

# 七、Stream Buffer


负责：

- 接收PCM；
- 缓存音频；
- 防止断流。


---

# 八、Timeline Scheduler


负责：

- 精确安排播放时间；
- 避免音频间隔。


---

# 九、AudioWorklet


负责：

- 独立音频线程；
- 低延迟处理；
- 稳定输出。


---

# 十、方案B


HTML Audio Element。


优势：

简单。


缺点：

- 延迟较高；
- 控制能力不足。


---

# 十一、方案C


JavaScript setInterval。


优势：

实现简单。


缺点：

浏览器调度不稳定。


---

# 十二、最终技术路线


采用：

WebAudio + AudioWorklet + Timeline Scheduler。


---

# 十三、验证要求


测试：

- 首次播放；
- 连续播放；
- Buffer稳定；
- 重连；
- 长时间运行。


---

# 十四、状态

QA-059完成。
