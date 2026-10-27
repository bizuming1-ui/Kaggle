/*
 * STM32F103C8T6 + Proteus 8 MATRIX-8X8 (column anode / row cathode)
 * Keil MDK uVision5, CMSIS only (no HAL and no SPL required).
 *
 * PROTEUS WIRING (device in the same orientation as the supplied image):
 *   Top pins, left -> right:    C1 C2 C3 C4 C5 C6 C7 C8
 *   MCU:                       PB0 PB1 PB2 PB3 PB4 PB5 PB6 PB7
 *
 *   Bottom pins, left -> right: R1 R2 R3 R4 R5 R6 R7 R8
 *   MCU:                        PB8 PB9 PB10 PB11 PB12 PB13 PB14 PB15
 *   Put one series resistor (for example 220 ohm in simulation) in each R line.
 *
 *   PA4 <- UP button,     other button terminal -> 3.3 V
 *   PA5 <- DOWN button,   other button terminal -> 3.3 V
 *   PA6 <- STOP button,   other button terminal -> 3.3 V
 *   PA7 is deliberately unused because no fourth-button function was specified.
 *
 * IMPORTANT:
 *   1. PB3/PB4 are JTAG pins after reset. Board_ClockAndDebugInit() disables
 *      JTAG but keeps SWD, so all of GPIOB can drive the matrix.
 *   2. PB2 is also BOOT1. That is fine for this Proteus GPIO assignment, but
 *      check the BOOT1 circuit before reusing this exact wiring on hardware.
 *   3. Direct GPIO drive is for Proteus. Real hardware needs suitable current
 *      limiting and row/column driver stages; do not exceed STM32 GPIO ratings.
 */
#include "stm32f10x.h"
#include "app.h"

static void Board_ClockAndDebugInit(void)
{
    RCC->APB2ENR |= RCC_APB2ENR_AFIOEN |
                    RCC_APB2ENR_IOPAEN |
                    RCC_APB2ENR_IOPBEN;

    /* SWJ_CFG = 010: JTAG-DP disabled, SW-DP enabled. */
    AFIO->MAPR = (AFIO->MAPR & ~(0x7UL << 24)) | (0x2UL << 24);

    SystemCoreClockUpdate();
}

int main(void)
{
    Board_ClockAndDebugInit();
    App_Init();

    /* One interrupt per millisecond: matrix scan + buttons + counter. */
    if (SysTick_Config(SystemCoreClock / 1000U) != 0U)
    {
        for (;;)
        {
            /* Invalid clock configuration: stop rather than run at a wrong rate. */
        }
    }

    for (;;)
    {
        __WFI();
    }
}

void SysTick_Handler(void)
{
    App_Task1ms();
}
