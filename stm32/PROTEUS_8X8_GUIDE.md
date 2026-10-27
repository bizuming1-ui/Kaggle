# Proteus 8：STM32F103C8T6 驱动 16 引脚 8×8 点阵

## 0. 本版为什么改成 3 文件自包含固件

上一版的启动 `8→1` 已在用户 Proteus 中出现，说明新产物加载和点阵扫描已经工作；但用户尚未看到 PA4 后的 2～7。本版取消启动诊断动画，直接显示 1，并把用户最新确认的完整范围固定为 1～8。若直接启动 1 后 PA4 仍无响应，应取得引脚低电平证据，而不是继续盲目修改消抖。

本版只交付以下 3 个文件：

```text
User/main.c
User/stm32f10x_it.c
User/stm32f10x_it.h
```

`matrix_firmware.h` 的常量和类型已全部并入 `main.c`，该头文件已删除。这样同时解决 ARMCC `cannot open source input file "matrix_firmware.h"` 的漏文件问题。

点阵、按键和计数全部在 `main.c` 内实现，不再包含 `app.h`，也不再调用旧 `App_*`、`Buttons_*` 或 `Matrix_*` 外部函数。浏览器中的 6 个旧 Hardware 文件已移除，避免复制到错误模块。

工作台 **“下载已验证 HEX”** 提供同一源码的独立 8 MHz 构建。可先用它排除 Keil 工程干扰；这不是已经在用户 `.pdsprj` 上运行通过的声明。完整证据见 [`ARM_VERIFICATION.md`](./ARM_VERIFICATION.md)。

此前 `MATRIX-8X8-BLUE` 全灭，换成 `MATRIX-8X8-RED` 后已经能显示 1。请保持红色点阵，不再修改显示器件或扫描极性。

## 1. 精确接线

### 点阵上方 8 个引脚

保持照片方向，上方从左到右：

| 点阵引脚 | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|---|
| STM32 | PB0 | PB1 | PB2 | PB3 | PB4 | PB5 | PB6 | PB7 |

### 点阵下方 8 个引脚

保持照片方向，下方从左到右：

| 点阵引脚 | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
|---|---|---|---|---|---|---|---|---|
| STM32 | PB8 | PB9 | PB10 | PB11 | PB12 | PB13 | PB14 | PB15 |

Proteus 默认模型为列阳极、行阴极：某列输出 HIGH 选中该列，某行输出 LOW 点亮交叉像素。每 1 ms 扫一列，8 ms 完成一帧。仿真可在每条 R 线串 220 Ω；真实硬件必须另算限流、扫描占空比和驱动级，不能直接照搬 GPIO 电流连接。

### 按键

| 功能 | STM32 输入 | 按键另一端 | 程序输入方式 |
|---|---|---|---|
| 递增 | PA4 | GND | 内部上拉，按下 LOW |
| 递减 | PA5 | GND | 内部上拉，按下 LOW |
| 停止 | PA6 | GND | 内部上拉，按下 LOW |
| 第四键（如保留） | PA7 | GND | 不分配功能 |

本版按照用户确认的实际接线：按键一端接 PA4/PA5/PA6，另一端接 GND。不要改回 3.3 V，否则需要另一套下拉、高电平触发代码。

PB3/PB4 复位后与 JTAG 复用，`main.c` 已关闭 JTAG 并保留 SWD。PB2 同时是 BOOT1，Proteus 可按上表使用；实物需另查启动电平。

## 2. 程序行为

- **复位直接显示 `1` 并暂停，没有启动 8，也没有任何禁止按键的启动窗口。**
- 轻触 PA4：第一个低电平采样立即 `1→2`；即使马上松开，也继续每 `FW_STEP_TIME_MS`（500 ms）自动 `3、4、5、6、7、8`，到 **8** 停止。完整 `1→8` 约 3 秒。
- 在 8 轻触 PA5：立即 `8→7`，随后每 500 ms 自动 `6、5、4、3、2、1`，到 **1** 停止。完整 `8→1` 同样约 3 秒。
- 在其他当前数字上按 PA4/PA5，则从当前数字向上/向下走，不强制重置到端点。
- 方向键首次低电平后锁存，按下抖动和持续按住不会重复启动；连续松开 HIGH 20 ms 后才允许下一次按键。松开方向键不取消自动计数。
- PA6 低电平在 1 ms 任务中优先暂停，保留当前数字并清零本步计时；松开不会自动恢复。重新轻触方向键才从暂停值继续。
- 同时事件优先级：PA6 停止 > PA4 递增 > PA5 递减；PA7 不参与控制。

> 初始 1 已暂停时，PA5 到下限、PA6 再次暂停都可能没有视觉变化。首先测试 PA4；在 8 时再测试 PA5。

### 2.1 如何确认本版并定位剩余问题

1. 本版从头运行应**直接显示 1**。如果仍先显示启动 8、再变 1，说明 Proteus 仍在运行上一版产物，应重新检查 Program File 和修改时间。
2. 直接显示 1 后轻触 PA4，应立即看到 2，随后看到 3～8；不能只观察是否最终到 8，因为中间每个数字应各保持约 500 ms。
3. 若本版已经直接启动为 1，而 PA4 按下期间仍一直为 1，下一步必须测量 MCU 的 PA4 引脚：释放时应为 HIGH，按住按钮时应为 LOW。需要实时电压/逻辑探针或 `.pdsprj` 证据，不能只根据按钮外观猜测。

## 3. 复制到 Keil µVision5

浏览器工作台 → **项目源码** → 逐个打开上述 3 个文件 → **复制代码**，放到工程的 `User/` 目录。不需要创建或复制 `matrix_firmware.h`。

1. **从 Keil Target 移除旧的 `Hardware/app/app.c`、`Hardware/buttons/buttons.c`、`Hardware/matrix/matrix.c`。** 新主程序完全不调用它们；保留在磁盘不重要，但不要再加入编译。
2. 如果 Project 中仍有 `Scene.c/scene.c`，也执行 **Remove File from Group / Remove Item**。本固件不使用 Scene、CatAnim、OLED 或数学模块，不能用空桩掩盖旧链接错误。
3. 只保留一个 `main()`。目标器件选择 `STM32F103C8T6`，使用现有 CMSIS 启动文件和 `system_stm32f10x.c`；旧版 CMSIS 工程定义 `STM32F10X_MD`。
4. 本固件只依赖设备头 `stm32f10x.h`，不需要 HAL、SPL 或任何 Hardware Include Paths。
5. 用工作台内容替换原来的 `stm32f10x_it.c/.h`，不要添加第二份中断文件。`SysTick_Handler()` 只递增唯一的 `system_tick`，主循环按累计 tick 执行扫描和按键任务，不读取 COUNTFLAG。
6. 执行 **Project → Clean Targets**，再执行 **Rebuild all target files**。必须确认 0 Error，并检查新 AXF/HEX 的修改时间。
7. 停止 Proteus，双击 STM32，将 **Program File** 明确指向本次新 AXF/HEX，或者直接使用工作台的独立 `/firmware.hex`。不要仅凭 `Objects\Project.axf` 路径假定内容已更新。

程序调用 `SystemCoreClockUpdate()` 后按 `SystemCoreClock / 1000` 配置 SysTick。工程必须保留正确的 CMSIS 时钟文件；独立 HEX 则固定使用 8 MHz HSI，不依赖用户时钟工程。

## 4. 已完成的验证

- 只编译当前 `main.c + stm32f10x_it.c`，生成真实 Thumb/Cortex-M3 ELF，并由 Unicorn 从复位执行。
- 复位直接为 1，第一个任务 tick 已能响应 PA4；全程没有启动 8 或数字 9。
- GPIOB 八列连续扫描，像素可重建为数字 1 和 8。
- 短触并松开 PA4 后，真实 ARM 指令执行依次得到 2、3、4、5、6、7、8，并在 8 暂停；短触 PA5 后依次得到 7、6、5、4、3、2、1，并在 1 暂停。
- PA6 在即将自动步进的一拍仍优先暂停；方向键可从暂停值继续，松开 PA6 不会自行恢复。
- 按下抖动不重复触发；连续松开 20 ms 后再次按下才产生下一事件；1～8 饱和、PA7 无动作、SysTick 回绕均通过测试。
- 主程序未引用旧 `App_/Buttons_/Matrix_` 外部符号；浏览器只提供 3 个交付源码文件，且无自定义业务头文件依赖。
- 独立 HEX 已按 Intel HEX 记录回读，并逐字节核对 ELF LOAD 段。

尚未在用户的 `.pdsprj` 上直接运行 Proteus，也未把 Unicorn 的逻辑执行等同于 Proteus 电气模型。若仍显示启动 8，先检查 Program File；若已经直接显示 1 而 PA4 仍不变 2，下一步必须检查按住期间的 PA4 实际电平及按钮网络，而不是再猜测按键算法。
