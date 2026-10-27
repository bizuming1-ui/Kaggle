# F103 Studio — STM32 浏览器工作台

面向 **STM32F103C8T6 / Keil MDK µVision5** 的独立工作区。当前版本聚焦可验证的素材导入、源码编辑、视频预览与**真实项目落盘**；不会把浏览器内存、`localStorage` 或 IndexedDB 冒充项目保存。

## Proteus 8 × 8×8 点阵固件

`stm32/project/code/` 现已包含一套可在工作台直接复制的 STM32F103C8T6 固件，目录与当前 Keil 工程对应：`User/main.c`、`User/stm32f10x_it.c/.h`、`Hardware/app/app.c/.h`、`Hardware/matrix/matrix.c/.h`、`Hardware/buttons/buttons.c/.h`。最新版本按照片的实际接线，将 PA4/PA5/PA6 配置为**内部上拉、接 GND 时按下**。轻触 PA4/PA5 时，第一个低电平采样就立即递增/递减一步并锁存，不要求按住 20 ms；20 ms 只用于松开消抖和允许下一次按键。随后按 500 ms 间隔继续到 9/1；PA6 拉低立即停止。点阵采用 Proteus 默认列阳极/行阴极的 8 列动态扫描。工程提供唯一的 `SysTick_Handler` 和 `system_tick` 定义，主循环按累计毫秒 tick 持续扫描，不再依赖 `COUNTFLAG` 或未知的旧中断实现。最新照片中的 `MATRIX-8X8-RED` 已能显示 1，保持该红色点阵即可；本次只修复短按首次响应与重新武装逻辑。

工作台另外提供 **`/firmware.hex`** 下载：这是当前五个 `.c` 的独立 8 MHz Proteus A/B 版本，用于排除旧 `Project.axf` 和 Keil 工程集成干扰。它已在 Unicorn 中实际执行 Thumb/Cortex-M3 指令，确认连续八列扫描和 PA4/PA5/PA6 行为；这不等于已经在用户的 Proteus 原理图上通过。

精确接线、独立 HEX 使用方法、失效 `Scene.c` 引用处理与 Keil 工程集成见 [`PROTEUS_8X8_GUIDE.md`](./PROTEUS_8X8_GUIDE.md)；实测寄存器序列、像素重建、HEX 校验值与仿真边界见 [`ARM_VERIFICATION.md`](./ARM_VERIFICATION.md)。

```bash
npm run stm32:firmware-test
```

## 启动

在仓库根目录执行：

```bash
npm install
npm run stm32:dev
```

默认监听 `0.0.0.0:3000`。可用环境变量调整：

```bash
STM32_PORT=3000 STM32_PROJECT_ROOT=/absolute/project/path npm run stm32:dev
```

- `STM32_PORT` / `PORT`：HTTP 端口，默认 `3000`。
- `STM32_PROJECT_ROOT`：可选，自定义素材工作区。默认是仓库内的 `stm32/project/`。
- 前端全部使用相对 API 地址；不要在前端写 `localhost` 或 `127.0.0.1`，这样 Arena/反向代理预览也能保存。

## 保存语义（重点）

1. 选择或拖入文件后，文件只进入页面里的**待保存队列**，此时没有写入项目。
2. 点击顶部或右侧的 **“保存到项目”**，浏览器才逐项调用后端 `PUT` API。
3. 后端将请求体流式写入同目录临时文件，执行 `fsync`，再原子 `rename` 成目标文件。
4. 后端重新从磁盘读取文件并计算 SHA-256；与写入摘要不一致则返回错误。
5. 前端重新请求 `/api/files`，展示后端目录扫描结果。刷新页面后，已保存文件仍然存在。

默认真实路径：

| 类型 | 项目路径 | 限制 |
|---|---|---|
| Keil C 源码 | `stm32/project/code/**/*.c` | 2 MB / 个 |
| Keil 头文件 | `stm32/project/code/**/*.h` | 2 MB / 个 |
| 参考视频 | `stm32/project/videos/**/*` | 500 MB / 个 |

视频支持 MP4、WebM、MOV、M4V、AVI、MKV 的保存；能否在页面播放取决于浏览器编解码器。推荐使用 H.264 视频 + AAC 音频的 MP4。

### 不会静默覆盖

- 上传队列中的文件与磁盘同名时，需要用户明确确认覆盖。
- 已打开源码带有 `expectedSha` 乐观锁；如果 Keil 或其他程序在编辑期间改动了磁盘文件，后端返回 `409 VERSION_CONFLICT`，不会用旧编辑内容覆盖新文件。
- 多文件保存是逐文件原子操作，不假装提供跨多文件事务。部分失败时，成功项保留在磁盘，失败项留在队列并显示原因。

## Keil 中文编码与换行

源码按原始字节上传，不会在导入阶段自动转码。文本读取与编辑支持：

- UTF-8
- UTF-8 BOM
- GB18030 / GBK（Keil 中文注释常见）
- CRLF / LF

编辑器内部统一使用 LF 显示，保存时恢复原换行格式。GB18030/GBK 保存前执行编码往返校验，不能无损表示字符时会拒绝保存并提示改用 UTF-8。UTF-16/NUL 源码会被明确拒绝，避免把二进制内容当 C 源码。

## 页面功能

- **工作台**：混合导入源码和视频、待保存队列、真实保存状态、项目文件列表。
- **项目源码**：目录筛选、C/H 查看与编辑、`Ctrl/Cmd + S` 保存当前、`Ctrl/Cmd + Shift + S` 保存全部。
- **参考视频**：待保存临时预览与已保存项目流式预览，支持 HTTP Range。
- **硬件仿真**：提供经过离线 ARM 指令级验证的独立 HEX 下载、固定目标参数与 Blue Pill 外观视图；浏览器实时执行内核仍未配置，不生成虚假 LED、USART 或周期数据。
- **保存记录**：创建、更新、删除的时间、大小与 SHA-256 审计记录。

## Git 策略

“保存到项目”是真实的文件系统保存，**不会自动执行 `git commit` 或 `git push`**。这样浏览器 API 不会未经确认改写仓库历史或凭用户凭据推送任意内容。

- `stm32/project/code/` 默认可由 Git 跟踪，便于后续审查和提交用户固件。
- `stm32/project/videos/` 默认忽略，防止大型视频无意进入 Git；文件仍会真实保存到项目磁盘。
- `stm32/project/.workspace/` 本地审计记录默认忽略。
- 如果需要把大型参考视频纳入版本管理，建议在确认仓库配额后使用 Git LFS，而不是直接提交大二进制。

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 芯片、目录、限制、Git 分支与连接状态 |
| GET | `/api/files` | 扫描真实项目文件 |
| PUT | `/api/files/content?path=code/main.c` | 原始字节保存；同名覆盖使用 `overwrite=1` |
| GET | `/api/files/content?path=code/main.c` | 解码源码并返回编码、换行与 SHA |
| PUT | `/api/files/text?path=code/main.c` | 按原编码保存编辑内容，支持 `expectedSha` |
| GET/HEAD | `/api/files/raw?path=videos/demo.mp4` | 下载或 Range 流式读取 |
| DELETE | `/api/files?path=code/main.c` | 删除一个普通项目文件 |
| GET | `/api/history` | 读取落盘审计记录 |

服务端会限制可写根目录、扩展名、路径层级和请求体大小，拒绝路径穿越、符号链接逃逸、Windows 保留名和跨来源写入。

> 这是单用户开发工具，不包含账号体系。公网部署时应放在可信认证/访问控制之后，不要把无认证的写文件 API 直接暴露到公共互联网。

## 测试

```bash
npm run stm32:test
```

测试使用独立的临时目录，不会污染真实 `stm32/project/`。覆盖：

- 未显式保存时目录为空；保存后实际字节存在；
- GB18030 中文与 CRLF 保留；
- 同名覆盖冲突、陈旧版本冲突；
- 路径穿越、非法扩展名、UTF-16 拒绝；
- 视频字节保存与 HTTP Range；
- 反向代理同源写入与跨站写入拒绝；
- 审计记录与删除；
- 前端没有使用浏览器存储替代项目落盘。

原有 QTTS 测试仍使用 `npm test`，两个模块互不影响。

## 当前边界：离线 ARM 验证不等于 Proteus 电气验证

当前五个业务 `.c` 已在补充启动/链接支持后生成真实 Thumb ELF，并由 Unicorn 执行；独立 HEX 的扫描、按键和像素数据已有实测记录。测试框架按 1 ms 调用真实 SysTick Handler，并检查重装值，但未把 Unicorn 当作完整的周期精确 NVIC 或 Proteus 电气模型。

浏览器页本身仍没有实时 ARM 内核，不会用随机动画或假日志冒充运行结果。用户具体 Keil 工程的启动/时钟文件、Proteus Program File、LED 压降与原理图仍需在 Proteus 中做最终 A/B 验证。
