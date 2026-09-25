# QA-113

# ViiTorVoice API Gateway接口设计方案确认


## 一、问题背景

ViiTorVoice需要统一服务入口。


客户端：

↓

API Gateway

↓

Runtime


---

# 二、具体提问

如何设计ViiTorVoice API Gateway，使客户端请求、WebSocket连接和后端Runtime能够稳定通信？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## FastAPI + WebSocket Gateway


---

# 五、整体架构


Client


↓

API Gateway


↓

Session Manager


↓

Runtime


---

# 六、API Gateway职责


包括：


## HTTP API


负责：

- 请求入口；
- 参数处理。


---

## WebSocket Upgrade


负责：

实时音频连接。


---

## Authentication


负责：

用户身份验证。


---

## Routing


负责：

请求转发。


---

# 七、优势


实现：

- 高性能；
- 支持异步；
- 支持Streaming；
- 易扩展。


---

# 八、方案B


纯WebSocket Server。


优势：

简单。


缺点：

API管理能力弱。


---

# 九、方案C


Flask HTTP接口。


优势：

开发简单。


缺点：

实时能力不足。


---

# 十、最终技术路线


采用：

FastAPI + WebSocket Gateway。


---

# 十一、验证要求


测试：

- API请求；
- WebSocket连接；
- 并发访问；
- 异常处理。


---

# 十二、状态

QA-113完成。
