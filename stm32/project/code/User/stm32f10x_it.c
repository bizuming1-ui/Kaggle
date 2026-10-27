#include "stm32f10x.h"
#include "stm32f10x_it.h"

/* Replace the existing stm32f10x_it.c with this file; do not add a second
   interrupt source file. This is the only system_tick definition. */
volatile uint32_t system_tick = 0U;

void SysTick_Handler(void)
{
    /* Keep the ISR minimal: main.c consumes every elapsed 1 ms tick and runs
       matrix scanning plus momentary-key sampling outside interrupt context. */
    ++system_tick;
}
