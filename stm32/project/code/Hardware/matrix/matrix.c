#include "matrix.h"
#include "stm32f10x.h"

/* Proteus default MATRIX-8X8 orientation:
   - C1..C8 are column ANODES. One column is selected with a HIGH level.
   - R1..R8 are row CATHODES. A pixel is enabled by driving its row LOW.
   - Bit 0 in each column byte is the top pixel (R1); bit 7 is R8. */
static const uint8_t s_digitColumns[9][8] =
{
    /* 1 */ { 0x00, 0x00, 0x40, 0x42, 0x7F, 0x40, 0x40, 0x00 },
    /* 2 */ { 0x00, 0x42, 0x61, 0x51, 0x49, 0x46, 0x00, 0x00 },
    /* 3 */ { 0x00, 0x41, 0x49, 0x49, 0x49, 0x36, 0x00, 0x00 },
    /* 4 */ { 0x00, 0x18, 0x14, 0x12, 0x7F, 0x10, 0x00, 0x00 },
    /* 5 */ { 0x00, 0x4F, 0x49, 0x49, 0x49, 0x31, 0x00, 0x00 },
    /* 6 */ { 0x00, 0x3E, 0x49, 0x49, 0x49, 0x30, 0x00, 0x00 },
    /* 7 */ { 0x00, 0x01, 0x01, 0x71, 0x0D, 0x03, 0x00, 0x00 },
    /* 8 */ { 0x00, 0x36, 0x49, 0x49, 0x49, 0x36, 0x00, 0x00 },
    /* 9 */ { 0x00, 0x06, 0x49, 0x49, 0x49, 0x3E, 0x00, 0x00 }
};

static const uint8_t * volatile s_activeColumns;
static uint8_t s_scanColumn;

void Matrix_Init(void)
{
    /* Idle: all column anodes LOW, all row cathodes HIGH => every LED off. */
    GPIOB->ODR = 0x0000FF00UL;

    /* PB0..PB15: general-purpose push-pull output, 50 MHz (0x3). */
    GPIOB->CRL = 0x33333333UL;
    GPIOB->CRH = 0x33333333UL;

    s_scanColumn = 0U;
    Matrix_SetDigit(1U);
}

void Matrix_SetDigit(uint8_t digit)
{
    if ((digit >= 1U) && (digit <= 9U))
    {
        /* A Cortex-M3 pointer store is atomic. The scanner therefore sees
           either the complete old digit or the complete new digit. */
        s_activeColumns = s_digitColumns[digit - 1U];
    }
}

void Matrix_Scan1ms(void)
{
    const uint8_t *columns = s_activeColumns;
    uint8_t column;
    uint8_t rowsOff;

    if (columns == 0)
    {
        GPIOB->ODR = 0x0000FF00UL;
        return;
    }

    column = (uint8_t)(s_scanColumn & 0x07U);
    rowsOff = (uint8_t)(~columns[column]);

    /* Low byte: PB0..PB7 -> C1..C8, one-hot HIGH.
       High byte: PB8..PB15 -> R1..R8, LOW only for lit pixels. */
    GPIOB->ODR = ((uint32_t)rowsOff << 8) | ((uint32_t)1U << column);
    s_scanColumn = (uint8_t)((column + 1U) & 0x07U);
}
