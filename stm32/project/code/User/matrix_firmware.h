#ifndef MATRIX_FIRMWARE_H
#define MATRIX_FIRMWARE_H

#include <stdint.h>

/* Timing and range are deliberately kept in the same User directory as the
   self-contained implementation, so no Hardware Include Paths are needed. */
#define FW_STEP_TIME_MS       500U
#define FW_RELEASE_MS         20U
#define FW_INITIAL_DIGIT      1U
#define FW_MIN_DIGIT          1U
#define FW_MAX_DIGIT          9U

typedef enum
{
    FW_PAUSED = 0,
    FW_COUNTING_UP,
    FW_COUNTING_DOWN
} FirmwareMode;

void Firmware_Init(void);
void Firmware_Task1ms(void);

/* Read-only accessors also make the exact delivered main.c testable. */
uint8_t Firmware_GetDigit(void);
FirmwareMode Firmware_GetMode(void);
uint32_t Firmware_GetElapsedMs(void);

#endif
