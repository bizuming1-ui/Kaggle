# QA-103

# ViiTorVoice Core AI Runtime代码仓库结构设计方案确认


## 一、问题背景

ViiTorVoice开始进入实际工程开发阶段。


需要建立：

稳定；

可扩展；

可维护；

支持生产部署的代码结构。


---

# 二、具体提问

如何设计ViiTorVoice代码仓库目录结构，使其支持AI模型、实时音频、前端、测试和未来扩展？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Production Monorepo结构（推荐）


---

# 五、整体目录


ViiTorVoice


├── apps

├── core

├── runtime

├── audio_engine

├── frontend

├── tests

├── docs

└── scripts


---

# 六、apps


负责：

应用入口。


包括：

启动程序；

服务入口。


---

# 七、core


负责：

核心AI逻辑。


包括：

- Speaker Encoder；
- TTS流程；
- 模型接口。


---

# 八、runtime


负责：

模型运行环境。


包括：

- 模型加载；
- 推理管理；
- GPU调度。


---

# 九、audio_engine


负责：

实时音频处理。


包括：

- Rust Audio Engine；
- Ring Buffer；
- PCM处理。


---

# 十、frontend


负责：

Web客户端。


包括：

- WebAudio；
- 用户交互。


---

# 十一、tests


负责：

自动测试。


包括：

- 单元测试；
- Benchmark；
- 回归测试。


---

# 十二、docs


负责：

技术文档。


包括：

- 架构说明；
- 开发记录。


---

# 十三、scripts


负责：

自动化。


包括：

- 启动脚本；
- 部署脚本；
- 测试脚本。


---

# 十四、方案B


简单Python项目结构。


优势：

快速开发。


缺点：

后期扩展困难。


---

# 十五、方案C


全部代码放一个目录。


优势：

开始简单。


缺点：

无法维护。


---

# 十六、最终技术路线


采用：

Production Monorepo结构。


---

# 十七、验证要求


确认：

- 模块独立；
- 测试可运行；
- 支持Rust/CUDA扩展；
- 支持生产部署。


---

# 十八、状态

QA-103完成。
