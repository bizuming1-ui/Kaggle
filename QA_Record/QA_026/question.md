# QA-026

# ViiTorVoice Kaggle Dataset固化恢复方案确认


## 一、问题背景

ViiTorVoice需要长期在Kaggle环境运行。


Kaggle运行环境可能重启。


要求恢复：

- 模型；
- Voice Clone Cache；
- 配置；
- 编译缓存；
- 监控数据；
- 系统状态。


目标：

重新连接Kaggle后可以快速恢复。


---

# 二、具体提问

如何设计Dataset保存方案，使ViiTorVoice可以版本化保存并快速恢复？


---

# 三、方案A

## Versioned Dataset Snapshot系统（推荐）


目录结构：


ViiTorVoice Snapshot


models/

保存：

- Qwen3-TTS模型；
- LLM模型。


---

voice_cache/

保存：

- Speaker Embedding；
- Voice Prompt Cache。


---

configs/

保存：

- GPU配置；
- Runtime配置；
- Scheduler配置。


---

compiled/

保存：

- torch.compile缓存；
- CUDA Graph相关缓存。


---

logs/

保存：

- 性能日志；
- 测试结果。


---

manifest.json

记录：

- 版本号；
- 文件SHA；
- 环境信息；
- 更新时间。


---

# 四、版本管理


每次阶段完成：

生成：


snapshot_v001

snapshot_v002

snapshot_v003


支持：

- 恢复；
- 回滚；
- 对比。


---

# 五、方案B

## 只保存模型文件


优势：

简单。


缺点：

丢失：

- 配置；
- Cache；
- 环境状态。


---

# 六、方案C

## 每次重新安装环境


优势：

流程简单。


缺点：

- 时间长；
- 容易出现环境差异。


---

# 七、用户选择

选择：

A


---

# 八、最终技术路线


采用：

版本化Dataset Snapshot。


结合：


Kaggle Dataset

↓

Snapshot Restore

↓

一键启动脚本

↓

ViiTorVoice运行


---

# 九、开发要求


必须实现：

- Snapshot生成程序；
- Restore程序；
- manifest校验；
- SHA检查。


---

# 十、验证标准


必须确认：

- 重启后可恢复；
- 文件完整；
- 版本一致；
- 启动成功。


---

# 十一、状态

QA-026完成。
