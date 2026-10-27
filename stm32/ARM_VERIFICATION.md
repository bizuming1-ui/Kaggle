# STM32F103C8T6 点阵固件：ARM 指令级验证记录

验证日期：2026-10-27。

## 1. 验证对象与方法

本次不是只做主机 C 单元测试，也不是只检查 `.o` 能否生成。沙盒使用 Clang/Lld 以 `thumb-freestanding-eabi`、Cortex-M3 为目标，直接编译并链接以下当前项目源文件：

- `project/code/User/main.c`
- `project/code/User/stm32f10x_it.c`
- `project/code/Hardware/app/app.c`
- `project/code/Hardware/buttons/buttons.c`
- `project/code/Hardware/matrix/matrix.c`

生成的 Thumb ELF 由 Unicorn 2.1.4 按 ARM 指令执行。仿真从复位入口开始，初始化真实 STM32 地址上的 GPIO、AFIO、RCC 和 SysTick 寄存器，再注入 PA4/PA5/PA6 输入电平，读取 GPIOB ODR 和应用内部状态。

独立 HEX 使用 8 MHz HSI 假设和最小的 Cortex-M3 启动/链接支持，不依赖用户旧工程中的 `Project.axf`、启动文件或时钟文件。Keil 可复制的 9 个 `.c/.h` 业务文件没有为本次验证改写。

### 明确的验证边界

- 每 1 ms 由测试框架调用一次真实 `SysTick_Handler`，主循环仍执行其原生 Thumb 指令。这验证了 Handler、累计 tick 调度和任务行为；**没有把 Unicorn 宣称为完整的 NVIC/SysTick 周期精确外设模型**。
- 检查了独立 8 MHz 版本的 `SysTick->LOAD == 7999` 和 `CTRL == 7`。
- GPIOA IDR 是注入的逻辑电平，GPIOB ODR 是实际代码写出的寄存器结果；没有把逻辑探针采样噪声混入结论。
- 此验证不等于 Proteus 电气仿真，未验证用户原理图中的 LED 正向压降、电流、元件方向、Program File 路径或 Proteus 版本行为。

## 2. 实测结果

### 复位与连续扫描

复位后：数字为 1、模式为暂停、GPIOB ODR 为 `0x0000FF00`，主循环在等待 tick，没有卡在初始化。

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

随后序列重复。由此可以排除“当前源码始终停在第一列”的推断。静态截图里 PB0 高、其余列低、行全高，与数字 1 的第一个空白列输出相同；但静态截图不能显示随后是否继续扫描，因此不能据此证明程序停住。

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

### 轻触按键

- PA4 输入高电平并保持 20 个任务 tick：数字在第 20 tick 立即从 1 变为 2，模式变为递增；松开后仍保持该模式。
- 从首次步进起经过 500 tick：数字自动从 2 变为 3。
- 注入 PA6 高电平：下一个 1 ms 任务立即暂停，保留数字 3。
- 暂停后注入 PA5 高电平 20 tick：数字立即从 3 减为 2，模式变为递减；再次 PA6 可暂停。

完整测试结束输出为 `ARM_SIMULATION_PASS`。

## 3. 独立 Proteus HEX

工作台下载地址：`/firmware.hex`  
仓库文件：`stm32/public/firmware.hex`

- Intel HEX，Flash 起始地址 `0x08000000`。
- 初始 MSP：`0x20005000`；Reset 与 SysTick 向量均指向生成的 Thumb 代码。
- 8 MHz 独立版，SysTick 重装值 7999。
- 实际 Flash 数据 1436 字节。
- SHA-256：`d0e0f030ed8844dedf2327005748dce267c245b6f1cba949bbcbf7f997dee312`。

生成后又按 Intel HEX 记录逐字节回读，与 ELF 的所有 LOAD 段比较一致。该文件用于排除 Keil 工程集成和旧 AXF 干扰；它不是对用户 Proteus 原理图已经通过的承诺。

## 4. 对当前故障的结论

当前源码的扫描、首次立即步进、500 ms 自动步进和暂停逻辑已经在 ARM 指令级运行通过，因此不应继续盲目修改字模、扫描极性或延时。

Proteus 中应先只加载上述独立 HEX 做 A/B 测试。如果仍然全灭，下一步应检查具体原理图的 Program File 和电气链路；尤其可将 `MATRIX-8X8-BLUE` 临时换成 `MATRIX-8X8-RED` 做单一变量测试，因为蓝色 LED 模型的正向压降可能高于 3.3 V 直接驱动能力。没有用户的 `.pdsprj` 和对应 Proteus 运行结果，不能把其中任何一个外部原因写成已证实根因。
