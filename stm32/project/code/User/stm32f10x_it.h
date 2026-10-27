#ifndef STM32F10X_IT_H
#define STM32F10X_IT_H

#include <stdint.h>

/* Defined exactly once in stm32f10x_it.c. main.h may keep a compatible
   extern declaration, but must not allocate another system_tick object. */
extern volatile uint32_t system_tick;

void SysTick_Handler(void);

#endif
