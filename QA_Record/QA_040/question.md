# QA-040

# ViiTorVoice Kaggle Dataset固化恢复方案确认


## 一、问题背景

Kaggle环境存在：

- Session断开；
- GPU重启；
- Notebook重新连接。


导致：

- 模型重新下载；
- Cache丢失；
- 配置丢失；
- 环境重新初始化。


目标：

实现快速恢复。


---

# 二、具体提问

如何设计Kaggle数据固化方案，使ViiTorVoice能够断线恢复并继续开发？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Versioned Dataset Snapshot + One Click Restore（推荐）


---

# 五、目录设计


ViiTorVoice State


├── models


保存：

模型文件。


---

├── voice_cache


保存：

Voice Prompt Cache。


---

├── configs


保存：

系统配置。


---

├── benchmarks


保存：

性能测试数据。


---

├── runtime


保存：

Runtime状态。


---

# 六、Snapshot流程


开发状态


↓

生成Snapshot


↓

Kaggle Dataset


---

# 七、恢复流程


Dataset Mount


↓

manifest检查


↓

SHA256验证


↓

Restore


↓

Launch


---

# 八、版本管理


保存：


- Model Version；
- Dataset Version；
- Git Commit SHA；
- Runtime Version。


---

# 九、方案B


## 只保存模型文件


优势：

简单。


缺点：

无法恢复完整环境。


---

# 十、方案C


## 全部重新安装


优势：

环境干净。


缺点：

启动时间长。


---

# 十一、最终技术路线


采用：


Versioned Snapshot

+

One Click Restore


实现：

Kaggle快速恢复开发环境。


---

# 十二、验证要求


测试：


- Dataset恢复；
- Cache恢复；
- 模型加载；
- 配置恢复；
- 一键启动。


---

# 十三、状态

QA-040完成。
