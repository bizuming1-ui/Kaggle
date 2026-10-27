#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include "stm32f10x_it.h"

int main(void)
{
    system_tick = 0U;
    SysTick_Handler();
    assert(system_tick == 1U);
    SysTick_Handler();
    assert(system_tick == 2U);

    /* The counter must wrap naturally without a second definition or a
       special case that could stall main.c's unsigned tick comparison. */
    system_tick = UINT32_MAX;
    SysTick_Handler();
    assert(system_tick == 0U);

    puts("SysTick interrupt: PASS (single definition, 1 ms increment, uint32 wrap)");
    return 0;
}
