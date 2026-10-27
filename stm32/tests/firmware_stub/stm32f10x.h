#ifndef STM32F10X_H
#define STM32F10X_H

#include <stdint.h>

typedef struct
{
    volatile uint32_t CRL;
    volatile uint32_t CRH;
    volatile uint32_t IDR;
    volatile uint32_t ODR;
    volatile uint32_t BSRR;
    volatile uint32_t BRR;
    volatile uint32_t LCKR;
} GPIO_TypeDef;

typedef struct
{
    volatile uint32_t CR;
    volatile uint32_t CFGR;
    volatile uint32_t CIR;
    volatile uint32_t APB2RSTR;
    volatile uint32_t APB1RSTR;
    volatile uint32_t AHBENR;
    volatile uint32_t APB2ENR;
    volatile uint32_t APB1ENR;
} RCC_TypeDef;

typedef struct
{
    volatile uint32_t EVCR;
    volatile uint32_t MAPR;
} AFIO_TypeDef;

typedef struct
{
    volatile uint32_t CTRL;
    volatile uint32_t LOAD;
    volatile uint32_t VAL;
    volatile uint32_t CALIB;
} SysTick_Type;

extern GPIO_TypeDef mock_gpioa;
extern GPIO_TypeDef mock_gpiob;
extern RCC_TypeDef mock_rcc;
extern AFIO_TypeDef mock_afio;
extern SysTick_Type mock_systick;

#define GPIOA ((GPIO_TypeDef *)&mock_gpioa)
#define GPIOB ((GPIO_TypeDef *)&mock_gpiob)
#define RCC ((RCC_TypeDef *)&mock_rcc)
#define AFIO ((AFIO_TypeDef *)&mock_afio)
#define SysTick ((SysTick_Type *)&mock_systick)

#define SysTick_CTRL_COUNTFLAG_Msk (0x00010000UL)
#define SysTick_CTRL_CLKSOURCE_Msk (0x00000004UL)
#define SysTick_CTRL_ENABLE_Msk (0x00000001UL)

#define GPIO_Pin_4 ((uint16_t)0x0010U)
#define GPIO_Pin_5 ((uint16_t)0x0020U)
#define GPIO_Pin_6 ((uint16_t)0x0040U)
#define GPIO_Pin_7 ((uint16_t)0x0080U)

#define RCC_APB2ENR_AFIOEN (0x00000001UL)
#define RCC_APB2ENR_IOPAEN (0x00000004UL)
#define RCC_APB2ENR_IOPBEN (0x00000008UL)

extern uint32_t SystemCoreClock;
void SystemCoreClockUpdate(void);
uint32_t SysTick_Config(uint32_t ticks);
#define __WFI() ((void)0)

#endif
