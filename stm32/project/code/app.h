#ifndef APP_H
#define APP_H

#include <stdint.h>

/* User-adjustable behavior. No video was available to calibrate this interval. */
#define APP_STEP_TIME_MS       500U
#define APP_INITIAL_DIGIT      1U
#define APP_MIN_DIGIT          1U
#define APP_MAX_DIGIT          9U

typedef enum
{
    APP_PAUSED = 0,
    APP_COUNTING_UP,
    APP_COUNTING_DOWN
} AppMode;

void App_Init(void);
void App_Task1ms(void);

/* Debugger/test visibility; these do not change the running state. */
uint8_t App_GetDigit(void);
AppMode App_GetMode(void);
uint32_t App_GetElapsedMs(void);

#endif
