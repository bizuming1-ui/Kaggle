# QA-072

# ViiTorVoice安全配置与密钥管理系统设计方案确认


## 一、问题背景

ViiTorVoice涉及：

- API Key；
- HuggingFace Token；
- GitHub Token；
- 服务配置。


如果直接保存：

可能导致：

- 密钥泄露；
- GitHub误提交；
- Kaggle公开环境泄露。


需要建立安全配置管理系统。


---

# 二、具体提问

如何设计ViiTorVoice安全密钥管理系统，使不同运行环境能够安全加载配置？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## Secure Secret Management Layer（推荐）


---

# 五、整体架构


Secret Store


↓

Environment Loader


↓

Runtime Config


↓

Application


---

# 六、Secret Store


负责保存：

- API Key；
- Token；
- 私密配置。


原则：

不进入：

Git仓库。


---

# 七、Environment Loader


启动时：

自动读取：

环境变量。


检查：

- 是否存在；
- 是否有效。


---

# 八、Runtime Config


运行期间：

动态注入：

应用程序。


避免：

硬编码。


---

# 九、多环境支持


支持：


## Kaggle


读取：

Notebook环境变量。


---

## Windows


读取：

本地Environment。


---

## WSL2


读取：

Linux环境变量。


---

# 十、安全检查


包括：

- 密钥缺失检测；
- 泄露风险检测；
- Git提交检查。


---

# 十一、方案B


直接写入配置文件。


优势：

简单。


缺点：

容易泄露。


---

# 十二、方案C


写入代码内部。


优势：

最快。


缺点：

安全风险最高。


---

# 十三、最终技术路线


采用：

Secure Secret Management Layer。


---

# 十四、验证要求


测试：

- Kaggle加载；
- Windows加载；
- WSL2加载；
- Git扫描；
- 密钥隔离。


---

# 十五、状态

QA-072完成。
