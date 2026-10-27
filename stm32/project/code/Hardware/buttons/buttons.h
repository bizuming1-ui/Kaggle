#ifndef BUTTONS_H
#define BUTTONS_H

#include <stdint.h>

/* Latest Proteus photo: PA4/PA5/PA6 contacts connect to GND when pressed.
   The first LOW sample steps immediately; 20 ms of HIGH releases/re-arms. */
#define BUTTON_EVENT_UP       0x01U
#define BUTTON_EVENT_DOWN     0x02U
#define BUTTON_DEBOUNCE_MS    20U  /* release/re-arm time, not press delay */

void Buttons_Init(void);
uint8_t Buttons_Scan1ms(void);
uint8_t Buttons_StopIsPressed(void);

#endif
