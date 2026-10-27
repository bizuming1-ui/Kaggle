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
/* main.c is in User/, while the confirmed app.h location is Hardware/app/.
   This relative include fixes ARMCC #5 without modifying global Include Paths. */
#include "../Hardware/app/app.h"

/* The existing stm32f10x_it.c refers to this legacy millisecond counter.
   A header may declare it as extern, but exactly one C file must define it.
   Do not add another definition in main.h or another C file. */
volatile uint32_t system_tick = 0U;

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
    uint32_t ticks;

    Board_ClockAndDebugInit();
    App_Init();

    /* The matrix task polls COUNTFLAG, so this file does not define a
       SysTick_Handler. TICKINT remains enabled for the existing handler in
       stm32f10x_it.c, which services the legacy system_tick counter. */
    ticks = SystemCoreClock / 1000U;
    if ((ticks == 0U) || (ticks > 0x01000000UL))
    {
        for (;;)
        {
            /* Invalid clock: stop rather than run at a wrong rate. */
        }
    }

    SysTick->CTRL = 0U;
    SysTick->LOAD = ticks - 1U;
    SysTick->VAL = 0U;
    SysTick->CTRL = SysTick_CTRL_CLKSOURCE_Msk |
                    SysTick_CTRL_TICKINT_Msk |
                    SysTick_CTRL_ENABLE_Msk;

    for (;;)
    {
        /* COUNTFLAG is set every 1 ms and cleared by this CTRL read. */
        if ((SysTick->CTRL & SysTick_CTRL_COUNTFLAG_Msk) != 0U)
        {
            App_Task1ms();
        }
    }
}
