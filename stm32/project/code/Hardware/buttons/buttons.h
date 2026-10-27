#ifndef BUTTONS_H
#define BUTTONS_H

#include <stdint.h>

/* Latest Proteus photo: PA4/PA5/PA6 contacts connect to GND when pressed.
   Released inputs are HIGH through internal pull-ups; pressed inputs are LOW. */
#define BUTTON_EVENT_UP       0x01U
#define BUTTON_EVENT_DOWN     0x02U
#define BUTTON_DEBOUNCE_MS    20U

void Buttons_Init(void);
uint8_t Buttons_Scan1ms(void);
uint8_t Buttons_StopIsPressed(void);

#endif
