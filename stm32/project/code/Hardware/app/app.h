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

/* Umbrella module interface for Keil projects that keep every peripheral in
   a different Hardware subdirectory. app.c includes only this local header,
   so it does not need project-wide Include Paths for buttons.h or matrix.h.
   The declarations match matrix.h and buttons.h exactly. */
#define BUTTON_EVENT_UP       0x01U
#define BUTTON_EVENT_DOWN     0x02U

void Matrix_Init(void);
void Matrix_SetDigit(uint8_t digit);
void Matrix_Scan1ms(void);

void Buttons_Init(void);
uint8_t Buttons_Scan1ms(void);
uint8_t Buttons_StopIsPressed(void);

#endif
