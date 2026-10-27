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
 *   PA4 <- UP button,     other button terminal -> GND (as in the photo)
 *   PA5 <- DOWN button,   other button terminal -> GND (as in the photo)
 *   PA6 <- STOP button,   other button terminal -> GND (as in the photo)
 *   Released inputs use internal pull-ups; pressed inputs are active LOW.
 *   First LOW sample steps immediately; 20 ms HIGH releases/re-arms the key.
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
#include "stm32f10x_it.h"

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
    uint32_t lastTick;
    uint32_t currentTick;

    Board_ClockAndDebugInit();
    App_Init();

    /* SysTick_Handler() in the supplied stm32f10x_it.c is the only timing
       ISR. It increments system_tick; the main loop below never depends on
       COUNTFLAG or on an unknown legacy interrupt implementation. */
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
    lastTick = system_tick;

    for (;;)
    {
        currentTick = system_tick;

        /* Unsigned tick arithmetic also handles the 32-bit wrap. Catch up
           every elapsed millisecond so scanning and key sampling cannot stall
           after one COUNTFLAG read or one delayed main-loop iteration. */
        while (lastTick != currentTick)
        {
            App_Task1ms();
            ++lastTick;
        }
    }
}
