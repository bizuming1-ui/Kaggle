# STM32F103C8T6 点阵固件：ARM 指令级验证记录

验证日期：2026-10-27。本文对应当前工作区中的 GND 按键版本。

## 1. 验证对象与方法

本次不是只做主机 C 单元测试，也不是只检查 `.o` 能否生成。沙盒使用 Clang/Lld 以 `thumb-freestanding-eabi`、Cortex-M3 为目标，直接编译并链接以下当前项目源文件：

- `project/code/User/main.c`
- `project/code/User/stm32f10x_it.c`
- `project/code/Hardware/app/app.c`
- `project/code/Hardware/buttons/buttons.c`
- `project/code/Hardware/matrix/matrix.c`

生成的 Thumb ELF 由 Unicorn 2.1.4 按 ARM 指令执行。仿真从复位入口开始，初始化真实 STM32 地址上的 GPIO、AFIO、RCC 和 SysTick 寄存器，再按照最新照片注入 PA4/PA5/PA6 的 GND 按键电平，读取 GPIOA/GPIOB 寄存器和应用内部状态。

最新照片显示按键公共端接 GND，因此当前 `buttons.c/.h` 使用内部上拉、低电平按下。为消除短按无反馈，第一个低电平采样立即产生一次事件并锁存；20 ms 仅用于连续松开后的重新武装。独立 HEX 使用 8 MHz HSI 假设和最小 Cortex-M3 启动/链接支持，不依赖用户旧工程中的 `Project.axf`、启动文件或时钟文件。

### 明确的验证边界

- 每 1 ms 由测试框架调用一次真实 `SysTick_Handler`，主循环仍执行其原生 Thumb 指令。这验证了 Handler、累计 tick 调度和任务行为；**没有把 Unicorn 宣称为完整的 NVIC/SysTick 周期精确外设模型**。
- 检查了独立 8 MHz 版本的 `SysTick->LOAD == 7999` 和 `CTRL == 7`。
- GPIOA IDR 是注入的逻辑电平，GPIOA/GPIOB ODR 是实际代码写出的寄存器结果；没有把逻辑探针采样噪声混入结论。
- 此验证不等于 Proteus 电气仿真，未验证用户原理图中的 LED 正向压降、电流、元件方向、Program File 路径或 Proteus 版本行为。

## 2. 实测结果

### 复位、上拉与连续扫描

复位后：数字为 1、模式为暂停、GPIOB ODR 为 `0x0000FF00`，主循环在等待 tick，没有卡在初始化。PA4～PA7 释放输入注入为 `IDR=0xF0`；代码实际设置 `GPIOA ODR=0xF0`，正确选择内部上拉。高电平释放状态持续扫描不会产生虚假按键事件。

数字 1 的前 8 次扫描实际得到：

| Tick | 下一次列索引 | GPIOB ODR |
|---:|---:|---:|
| 1 | 1 | `0x0000FF01` |
| 2 | 2 | `0x0000FF02` |
| 3 | 3 | `0x0000BF04` |
| 4 | 4 | `0x0000BD08` |
| 5 | 5 | `0x00008010` |
| 6 | 6 | `0x0000BF20` |
| 7 | 7 | `0x0000BF40` |
| 8 | 0 | `0x0000FF80` |

随后序列重复。由此可以排除“当前源码始终停在第一列”的推断。

按 Proteus 默认“列阳极、行阴极”模型，把每 8 个连续 ODR 结果重建成一帧，数字 1 和数字 2 分别为：

```text
数字 1        数字 2
....#...      ..###...
...##...      .#...#..
....#...      .....#..
....#...      ....#...
....#...      ...#....
....#...      ..#.....
..#####.      .#####..
........      ........
```

### 照片中的 GND 轻触按键

- PA4 从高电平释放状态拉低后，**第一个 1 ms 任务 tick**就把数字从 1 变为 2，模式变为递增；不要求按住 20 tick。
- 从首次步进起经过 500 tick：数字自动从 2 变为 3。
- PA6 拉低：下一个 1 ms 任务立即暂停，保留数字 3。
- 暂停后 PA5 的第一个低电平 tick 立即把数字从 3 减为 2，模式变为递减；再次拉低 PA6 可暂停。
- 另行执行按下抖动序列：5 ms 高电平后再次拉低、19 ms 高电平后再次拉低，都不会产生新的事件；连续 20 ms 高电平后再次拉低，才从 3 立即变为 4。

完整测试结束输出为 `ARM_SIMULATION_PASS`，包括 `BOUNCE_REARM` 和最终暂停断言。

## 3. 独立 Proteus HEX

工作台下载地址：`/firmware.hex`  
仓库文件：`stm32/public/firmware.hex`

- Intel HEX，Flash 起始地址 `0x08000000`。
- 初始 MSP：`0x20005000`；Reset 与 SysTick 向量均指向生成的 Thumb 代码。
- 8 MHz 独立版，SysTick 重装值 7999。
- 实际 Flash 数据 1480 字节。
- SHA-256：`76ca7f94ab5e85f2a44bab2ae52bab884dd3b5bf4766d5164bd9347e8a0501d7`。

生成后又按 Intel HEX 记录逐字节回读，与 ELF 的所有 LOAD 段比较一致。该文件用于排除 Keil 工程集成和旧 AXF 干扰；它不是对用户 Proteus 原理图已经通过的承诺。

## 4. 最新照片提供的额外证据

1. **红色点阵已经显示 1。** 这说明显示电气和扫描已经工作，不需要继续修改字模或 GPIO 显示极性。
2. **按键释放电平正确。** PA4/PA5/PA6 在 MCU 端均呈高电平，与内部上拉相符；用户也明确确认按下时另一端接 GND。
3. **首次反馈不应依赖长按。** 旧实现要求连续按下 20 tick 才产生事件。新实现首个低电平 tick 立即步进并锁存，20 ms 仅用于松开重新武装，更适合 Proteus 中的短鼠标点击。
4. **仍必须排除旧构建。** 最新照片继续显示 `Objects\Project.axf`。当前 `App_Task1ms()` 每次扫描后都会无条件执行按键扫描，所以替换源码后仍需 Clean/Rebuild，并确认 Proteus 加载的是新 AXF/HEX，而不是仅根据路径推断版本。

尚未在用户的 `.pdsprj` 上直接执行 Proteus，因此不把工程版本或点击时长写成唯一已证实根因；上述代码变更和测试消除了首次按键必须保持 20 tick 的明确限制。
