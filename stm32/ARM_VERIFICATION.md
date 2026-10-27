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

最新照片显示按键公共端接 GND，因此当前 `buttons.c/.h` 已改为内部上拉、低电平按下；`main.c` 接线注释同步修改。独立 HEX 使用 8 MHz HSI 假设和最小 Cortex-M3 启动/链接支持，不依赖用户旧工程中的 `Project.axf`、启动文件或时钟文件。

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

- PA4 从高电平释放状态拉低并保持 20 个任务 tick：数字在第 20 tick 立即从 1 变为 2，模式变为递增；恢复高电平后仍保持该模式。
- 从首次步进起经过 500 tick：数字自动从 2 变为 3。
- PA6 拉低：下一个 1 ms 任务立即暂停，保留数字 3。
- 暂停后 PA5 拉低 20 tick：数字立即从 3 减为 2，模式变为递减；再次拉低 PA6 可暂停。

完整测试结束输出为 `ARM_SIMULATION_PASS`。

## 3. 独立 Proteus HEX

工作台下载地址：`/firmware.hex`  
仓库文件：`stm32/public/firmware.hex`

- Intel HEX，Flash 起始地址 `0x08000000`。
- 初始 MSP：`0x20005000`；Reset 与 SysTick 向量均指向生成的 Thumb 代码。
- 8 MHz 独立版，SysTick 重装值 7999。
- 实际 Flash 数据 1452 字节。
- SHA-256：`74a72a19af3fc377ec1043aabfc244690947459e0fb40f36ba5f5b385932d7f5`。

生成后又按 Intel HEX 记录逐字节回读，与 ELF 的所有 LOAD 段比较一致。该文件用于排除 Keil 工程集成和旧 AXF 干扰；它不是对用户 Proteus 原理图已经通过的承诺。

## 4. 最新照片提供的额外证据

1. **按键接线与旧代码相反。** PA4/PA5/PA6 左侧公共导线接 GND，旧代码却使用内部下拉并等待高电平；当前版本已按图修复。
2. **照片中的 AXF 不能视为当前源码的可靠构建。** 放大图显示 PB2 高、其他列低，PB15 低、其他行高，约为 `GPIOB=0x00007F04`。当前全部数字字模的任何扫描状态都不会产生 `7F04`，所以替换源码后必须 Clean/Rebuild，并确认 Proteus Program File 指向新产物。
3. **全灭还涉及电气模型。** 照片明确使用 `MATRIX-8X8-BLUE`。当前扫描逻辑已验证，但 3.3 V GPIO 对蓝色 LED 可能没有足够正向压降裕量。先换成 `MATRIX-8X8-RED` 做单变量验证；必须保留蓝色时需要驱动级、合适供电和限流，纯软件不能提高 GPIO 电压。

没有用户的 `.pdsprj` 和对应 Proteus 运行结果，不能把蓝色模型写成唯一已证实根因；但按键极性不匹配和照片电平不属于当前扫描序列，是可以直接核对的问题。
