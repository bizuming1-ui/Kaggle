#ifndef BUTTONS_H
#define BUTTONS_H

#include <stdint.h>

#define BUTTON_EVENT_UP       0x01U
#define BUTTON_EVENT_DOWN     0x02U
#define BUTTON_DEBOUNCE_MS    20U

void Buttons_Init(void);
uint8_t Buttons_Scan1ms(void);
uint8_t Buttons_StopIsPressed(void);

#endif
