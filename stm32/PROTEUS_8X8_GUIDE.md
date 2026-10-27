# Proteus 8：STM32F103C8T6 驱动 16 引脚 8×8 点阵

## 0. 先用已执行验证的独立 HEX 排除旧工程干扰

浏览器工作台点击 **“下载已验证 HEX”**（地址 `/firmware.hex`），停止 Proteus 后，把 STM32 的 **Program File** 只指向这个文件，不要继续使用无法确认构建时间的旧 `Project.axf`。仓库中的文件是 `public/firmware.hex`，SHA-256 与完整验证边界见 [`ARM_VERIFICATION.md`](./ARM_VERIFICATION.md)。

这个独立版本使用复位后的 8 MHz HSI，不依赖你的 Keil 启动/时钟工程；它仍由当前 `main.c`、SysTick 中断、应用、按键和点阵五个 `.c` 编译而成。已在 Unicorn 中实际执行 Thumb 指令，确认 GPIOB 八列连续扫描、PA4/PA5 首次立即步进、500 ms 自动步进和 PA6 暂停。**这不是已经在你的 Proteus 原理图上运行通过的声明。**

最新照片明确使用 `MATRIX-8X8-BLUE`，而 MCU 只有 3.3 V GPIO 直驱。请先将它替换为 `MATRIX-8X8-RED`，只改这一个变量再运行。蓝色 LED 模型的正向压降可能没有足够的 3.3 V 直驱裕量；此时继续修改 C 代码不会解决电气不导通问题。如果必须保留蓝色，需要另行设计驱动级、供电和限流，不能用纯软件代替。

## 1. 先确认器件，而不是按“七段数码管”接线

用户提供的第一张图是 8×8 单色 LED 点阵：上下各 8 个引脚，共 16 个引脚、64 个 LED。它不是一位七段数码管，不能使用 a/b/c/d/e/f/g/dp 的段码接法。

Proteus 默认方向下（与本指南假设的方向一致）：

- 上方：C1～C8，列阳极，**高电平选中一列**；
- 下方：R1～R8，行阴极，**低电平点亮该行像素**；
- 每次扫描一列，八列循环扫描形成稳定画面。

参考：CircuitsToday 的 Proteus 点阵教程明确给出了“顶部列、底部行”和“列阳极/行阴极”的驱动方式：
https://circuitstoday.com/proteus-tutorial-using-dot-matrix-displays

> 如果器件被旋转、镜像，或者不是 Proteus 默认的 MATRIX-8X8 模型，必须先恢复为图片中的默认方向。不要直接套用实体 1388/1588 点阵的非顺序物理引脚表。

## 2. 精确接线表

### 点阵上方 8 个引脚

保持图片方向，上方从左到右连接：

| 点阵引脚 | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 |
|---|---|---|---|---|---|---|---|---|
| STM32 | PB0 | PB1 | PB2 | PB3 | PB4 | PB5 | PB6 | PB7 |

### 点阵下方 8 个引脚

保持图片方向，下方从左到右连接：

| 点阵引脚 | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
|---|---|---|---|---|---|---|---|---|
| STM32 | PB8 | PB9 | PB10 | PB11 | PB12 | PB13 | PB14 | PB15 |

Proteus 中可在每一条 R1～R8 线路串一个电阻（例如 220 Ω），共 8 个。电阻放在每行可分别限制各像素电流；具体亮度可在仿真中调整。

### 按键

| 功能 | STM32 输入 | 按键另一端 | 程序输入方式 |
|---|---|---|---|
| 上升/递增 | PA4 | **GND（按照最新照片）** | 内部上拉，按下为低电平 |
| 下降/递减 | PA5 | **GND（按照最新照片）** | 内部上拉，按下为低电平 |
| 停止 | PA6 | **GND（按照最新照片）** | 内部上拉，按下为低电平 |
| 第四键（如保留） | PA7 | GND | **未分配功能，不参与控制** |

最新照片中 PA4/PA5/PA6 左侧公共导线末端是 Proteus 的 GND 端子，因此本版按照片的实际接线使用内部上拉和低电平按下。此前文字中的“另一端接 3.3 V”与照片不一致；两种接法不能使用同一组固定电平判断。本版选择按照片接线；若改回 3.3 V 接法则必须同时改回下拉、高电平触发。

用户只指定了 PA4、PA5、PA6 三个功能，因此程序不会猜测 PA7 是复位、启动或其他功能。

### 为什么不能忽略 PB3/PB4

PB3、PB4 复位后与 JTAG 复用。`main.c` 已通过 `AFIO->MAPR` 关闭 JTAG 并保留 SWD，使 PB3、PB4 可以作为 C4、C5 的普通 GPIO。若删除这段初始化，两列可能不显示。

PB2 同时是 BOOT1；Proteus 可按上述方式使用。移植实物时，需要另外确认 BOOT1 的启动电平和实际电路。

> 直接 GPIO 驱动以 Proteus 仿真为目标。真实硬件必须根据 LED 正向压降、扫描占空比和 STM32 电流限制设计限流与行/列驱动级，不能直接照搬电流连接。

## 3. 程序行为

- 上电显示 `1`，保持暂停。
- 轻触 PA4：20 ms 消抖确认高→低按下沿后**立即加 1**，随后每隔 `APP_STEP_TIME_MS` 再加 1；`1 → 2 → … → 9`，到 9 自动停止，不循环。
- 轻触 PA5：20 ms 消抖确认高→低按下沿后**立即减 1**，随后每隔 `APP_STEP_TIME_MS` 再减 1；`9 → 8 → … → 1`，到 1 自动停止，不循环。
- 按 PA6：在 1 ms 任务中优先停止，保留当前数字并清空未完成计时；松开 PA6 不会自动恢复。
- 暂停后再次轻触 PA4 或 PA5，从暂停数字立即走一步，随后获得一个完整的新自动步进周期。
- PA4/PA5 是瞬态按键：只在消抖后的高到低跳变产生一次启动事件，松开不会取消计数，持续按住也不会反复重启动事件。PA6 直接参与每毫秒优先判断，不等待方向键消抖。
- 同时产生方向事件时优先级为 PA6 停止 > PA4 递增 > PA5 递减。

默认 `APP_STEP_TIME_MS = 500U`，位于 `app.h`，它只控制**首次立即步进之后**的自动间隔。视频没有展示正常目标动画，所以 500 ms 仍是工程默认值，不声称是从正常效果视频测得的参数。

### 对最新“始终全灭且按键无响应”照片的诊断

1. 照片中按键公共端是 GND，旧代码却配置内部下拉并等待高电平，按下前后都可能是 LOW；本版已改为内部上拉、低电平按下。
2. 放大照片可读到 PB2 为高、其他列为低，PB15 为低、其他行为高，即 `GPIOB ≈ 0x00007F04`。当前数字 1 的合法扫描序列为 `FF01、FF02、BF04、BD08、8010、BF20、BF40、FF80`，不包含 `7F04`。因此不能把照片中的 `Project.axf` 当作当前源码的可靠构建；替换源码后必须 Clean/Rebuild，并确认 Program File 指向新产物。
3. 当前代码已在真实 ARM 指令执行中持续扫描并响应按键，不能再用静态画面猜测它停在第一列。点阵仍全灭时应处理 `MATRIX-8X8-BLUE` 的 3.3 V 直驱裕量，先按第 0 节换成 RED 验证。

完整寄存器记录见 [`ARM_VERIFICATION.md`](./ARM_VERIFICATION.md)。

## 4. 复制到 Keil µVision5

浏览器工作台 → **项目源码** → 逐个打开文件 → **复制代码**：

```text
User/main.c
User/stm32f10x_it.c
User/stm32f10x_it.h
Hardware/app/app.c
Hardware/app/app.h
Hardware/buttons/buttons.c
Hardware/buttons/buttons.h
Hardware/matrix/matrix.c
Hardware/matrix/matrix.h
```

1. 按上述相同相对位置替换文件。`app.h` 是统一接口头，`app.c` 不再跨目录包含 `buttons.h` 或 `matrix.h`；`User/main.c` 使用已经由编译日志确认的 `../Hardware/app/app.h` 相对路径，因此不需要为这三个模块额外配置 Include Paths。
2. 当前日志仍同时出现 `Hardware\Scene\Scene.c` 缺失和旧 `scene.o` 的 CatAnim/OLED 未定义符号。本次点阵程序不调用 Scene：在 Keil Project 窗口右击所有 `Scene.c/scene.c` 条目，选择 **Remove File from Group / Remove Item**，然后执行 **Project → Clean Targets**，再全量 Rebuild，确保旧 `scene.o` 不再进入链接。如果原项目确实需要 Scene 功能，则必须恢复完整的 Scene、CatAnim、OLED、数学与按键源码，不能用空文件或空桩函数掩盖问题。
3. 目标器件选择 `STM32F103C8T6`，使用现有 CMSIS 启动文件与 `system_stm32f10x.c`。旧版 CMSIS 工程需定义 `STM32F10X_MD`。
4. 本固件只依赖设备头 `stm32f10x.h`，不要求 HAL，也不要求添加标准外设库 GPIO 驱动文件。
5. 如果原工程已有另一个 `main()`，只保留一个。
6. **用工作台内容替换原来的 `stm32f10x_it.c/.h`，不要再添加第二份中断文件。** 新文件只保留本点阵需要的 SysTick 时序：`SysTick_Handler()` 每 1 ms 递增 `system_tick`，主循环按累计 tick 补执行扫描与按键任务，不再读取 COUNTFLAG。`system_tick` 只在 `stm32f10x_it.c` 定义一次；`main.h` 如保留声明，只能是兼容类型的 `extern`，不能再定义实体。若旧中断文件还承担其他外设功能，应先把那些源码从 Target 移除或明确合并对应 ISR，不能同时保留两个同名 Handler。
7. 在 Options for Target → Output 中勾选 **Create HEX File**，先 **Clean Targets**，再执行 **Rebuild all target files**。必须确认链接成功且 `.hex` 的修改时间已经更新，不能继续使用编译失败前留下的旧 AXF/HEX。
8. 停止 Proteus 仿真，双击 STM32，将 **Program File** 明确指向本次生成的 `.hex`，再重新运行；不要沿用视频路径中无法确认版本的旧 `Project.axf`。

程序使用 `SystemCoreClockUpdate()` 后按 `SystemCoreClock / 1000` 配置 SysTick，不会把重装值写死为仅适用于 72 MHz 的常数。若工程时钟配置不同，应确保 `SystemCoreClock` 与实际时钟一致。

## 5. 已完成的验证

- **真实 Thumb/Cortex-M3 指令执行**：当前五个 `.c` 生成的 ELF 已在 Unicorn 中从复位运行；GPIOB 八列连续变化，像素可重建为数字 1/2；按照片注入 GND 按键后，PA4 拉低立即递增、500 tick 后自动到 3、PA6 拉低立即暂停、PA5 拉低立即递减。详见 [`ARM_VERIFICATION.md`](./ARM_VERIFICATION.md)。
- 独立 8 MHz HEX 的 `SysTick->LOAD` 实测为 7999，`GPIOA ODR` 的 PA4～PA7 上拉选择位实测为 1；Intel HEX 已回读并逐字节核对 ELF 的 LOAD 段。
- 主机寄存器桩测试：扫描极性、8 列顺序、GND 按键上拉配置、低电平消抖、首次立即步进、松开后继续、暂停恢复、1～9 饱和、PA7 无动作。
- 暂停边界测试：在即将到达下一次递增前按 PA6，数字不额外跳变。
- SysTick 测试：每毫秒递增、32 位自然回绕，以及 `main.c` 引用与 `stm32f10x_it.c` 唯一定义。
- 浏览器文件来自真实 `stm32/project/code/`，可直接复制、编辑和再次保存。

已收到并逐帧检查本次故障视频。**尚未在你的具体 `.pdsprj` 上完成 Proteus 运行验证，也没有把 Unicorn 的逻辑执行等同于 LED 电压、电流和模型导通验证。** 最终仍应以独立 HEX 或本次成功链接的新 Keil HEX 在你的 Proteus 原理图中的实际结果为准。
