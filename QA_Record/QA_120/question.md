# QA-120

# ViiTorVoice CI/CD自动测试流程设计方案确认


## 一、问题背景

ViiTorVoice需要自动验证代码质量。


目标：

每次Git提交后：

自动测试；

自动检测性能；

自动生成结果。


---

# 二、具体提问

如何设计ViiTorVoice持续集成流程，使代码提交后自动完成测试和验证？


---

# 三、用户选择

选择：

A


---

# 四、方案A

## GitHub Actions CI Pipeline


---

# 五、整体流程


Git Push


↓

CI Trigger


↓

Install Dependencies


↓

Run Tests


↓

Run Benchmark


↓

Generate Report


---

# 六、自动测试


包括：

- 单元测试；
- 集成测试；
- 音频链路测试。


---

# 七、Benchmark验证


检测：

- TTFA；
- RTF；
- GPU性能；
- 延迟。


---

# 八、报告生成


输出：

- 测试结果；
- 性能数据；
- 错误信息。


---

# 九、优势


实现：

- 自动验证；
- 快速发现问题；
- 保持版本稳定。


---

# 十、方案B


人工测试。


缺点：

效率低。


---

# 十一、方案C


只运行单元测试。


缺点：

无法检测性能回归。


---

# 十二、最终技术路线


采用：

GitHub Actions CI Pipeline。


---

# 十三、验证要求


测试：

- Commit触发；
- 自动运行；
- 测试通过；
- 报告生成。


---

# 十四、状态

QA-120完成。
