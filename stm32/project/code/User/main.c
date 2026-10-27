/*
 * STM32F103C8T6 + Proteus 8 MATRIX-8X8-RED, Keil MDK uVision5.
 * Self-contained matrix/button application: no app.c, buttons.c, matrix.c,
 * HAL, SPL, Scene, OLED, or Hardware Include Paths are required.
 *
 * WIRING (same orientation as the supplied photo):
 *   Matrix top C1..C8    <- PB0..PB7    (column anodes, HIGH selects)
 *   Matrix bottom R1..R8 <- PB8..PB15   (row cathodes, LOW lights)
 *   PA4 UP, PA5 DOWN, PA6 STOP: other contact terminal -> GND.
 *   Released keys use internal pull-ups; pressed keys are LOW.
 *   Boot shows 1 and waits; PA4 counts 1..8, PA5 counts 8..1.
 *   A short press steps immediately, then continues every 500 ms.
 *   PA6 press stops once at the current digit; 20 ms HIGH re-arms all keys.
 *   PA7 is deliberately unused.
 *
 * Copy only User/main.c and User/stm32f10x_it.c/.h.
 * Remove legacy Hardware app/buttons/matrix sources from the Keil Target.
 */
#include "stm32f10x.h"
#include "stm32f10x_it.h"

/* All configuration and types live here too: no custom header is required. */
#define FW_STEP_TIME_MS       500U
#define FW_RELEASE_MS         20U
#define FW_INITIAL_DIGIT      1U
#define FW_MIN_DIGIT          1U
#define FW_MAX_DIGIT          8U

typedef enum
{
    FW_PAUSED = 0,
    FW_COUNTING_UP,
    FW_COUNTING_DOWN
} FirmwareMode;

#define FW_UP_PIN             (0x0010U)   /* PA4 */
#define FW_DOWN_PIN           (0x0020U)   /* PA5 */
#define FW_STOP_PIN           (0x0040U)   /* PA6 */
#define FW_UNUSED_PIN         (0x0080U)   /* PA7 */
#define FW_EVENT_UP           (0x01U)
#define FW_EVENT_DOWN         (0x02U)
#define FW_EVENT_STOP         (0x04U)

/* Bit 0 is R1 (top), bit 7 is R8 (bottom), one byte per column. */
static const uint8_t s_digitColumns[8][8] =
{
    { 0x00, 0x00, 0x40, 0x42, 0x7F, 0x40, 0x40, 0x00 }, /* 1 */
    { 0x00, 0x42, 0x61, 0x51, 0x49, 0x46, 0x00, 0x00 }, /* 2 */
    { 0x00, 0x41, 0x49, 0x49, 0x49, 0x36, 0x00, 0x00 }, /* 3 */
    { 0x00, 0x18, 0x14, 0x12, 0x7F, 0x10, 0x00, 0x00 }, /* 4 */
    { 0x00, 0x4F, 0x49, 0x49, 0x49, 0x31, 0x00, 0x00 }, /* 5 */
    { 0x00, 0x3E, 0x49, 0x49, 0x49, 0x30, 0x00, 0x00 }, /* 6 */
    { 0x00, 0x01, 0x01, 0x71, 0x0D, 0x03, 0x00, 0x00 }, /* 7 */
    { 0x00, 0x36, 0x49, 0x49, 0x49, 0x36, 0x00, 0x00 }  /* 8 */
};

typedef struct
{
    uint16_t pin;
    uint8_t pressedLatch;
    uint8_t releaseMs;
} FirmwareButton;

static FirmwareButton s_buttons[3] =
{
    { FW_UP_PIN, 0U, 0U },
    { FW_DOWN_PIN, 0U, 0U },
    { FW_STOP_PIN, 0U, 0U }
};

static const uint8_t * volatile s_activeColumns;
static uint8_t s_scanColumn;
static uint8_t s_digit;
static FirmwareMode s_mode;
static uint32_t s_elapsedMs;

static void Board_ClockAndDebugInit(void)
{
    RCC->APB2ENR |= RCC_APB2ENR_AFIOEN |
                    RCC_APB2ENR_IOPAEN |
                    RCC_APB2ENR_IOPBEN;

    /* PB3/PB4 start as JTAG pins. Disable JTAG, retain SWD. */
    AFIO->MAPR = (AFIO->MAPR & ~(0x7UL << 24)) | (0x2UL << 24);
    SystemCoreClockUpdate();
}

static void Firmware_MatrixGpioInit(void)
{
    GPIOB->ODR = 0x0000FF00UL;  /* all columns off, all rows off */
    GPIOB->CRL = 0x33333333UL;  /* push-pull outputs, 50 MHz */
    GPIOB->CRH = 0x33333333UL;
    s_scanColumn = 0U;
}

static void Firmware_MatrixSetDigit(uint8_t digit)
{
    if ((digit >= FW_MIN_DIGIT) && (digit <= FW_MAX_DIGIT))
    {
        s_activeColumns = s_digitColumns[digit - 1U];
    }
}

static void Firmware_MatrixScan(void)
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
    GPIOB->ODR = ((uint32_t)rowsOff << 8) | ((uint32_t)1U << column);
    s_scanColumn = (uint8_t)((column + 1U) & 0x07U);
}

static void Firmware_ConfigPullUp(uint8_t pin)
{
    uint32_t shift = (uint32_t)(pin & 0x07U) * 4U;

    /* Input pull-up/pull-down nibble 0x8; ODR=1 selects pull-up. */
    GPIOA->CRL = (GPIOA->CRL & ~(0x0FUL << shift)) | (0x08UL << shift);
}

static void Firmware_ButtonsInit(void)
{
    Firmware_ConfigPullUp(4U);
    Firmware_ConfigPullUp(5U);
    Firmware_ConfigPullUp(6U);
    Firmware_ConfigPullUp(7U);  /* safe idle, intentionally no action */

    /* Select pull-ups only after all four input-mode nibbles are final. */
    GPIOA->ODR |= (uint32_t)(FW_UP_PIN | FW_DOWN_PIN |
                              FW_STOP_PIN | FW_UNUSED_PIN);

    s_buttons[0].pressedLatch = 0U;
    s_buttons[0].releaseMs = 0U;
    s_buttons[1].pressedLatch = 0U;
    s_buttons[1].releaseMs = 0U;
    s_buttons[2].pressedLatch = 0U;
    s_buttons[2].releaseMs = 0U;
}

static uint8_t Firmware_ButtonEvents(void)
{
    uint8_t events = 0U;
    uint8_t index;

    for (index = 0U; index < 3U; ++index)
    {
        uint8_t rawPressed = (GPIOA->IDR & s_buttons[index].pin) ? 0U : 1U;

        if (rawPressed != 0U)
        {
            s_buttons[index].releaseMs = 0U;
            if (s_buttons[index].pressedLatch == 0U)
            {
                /* Immediate short-press feedback, exactly once per press. */
                s_buttons[index].pressedLatch = 1U;
                events |= (uint8_t)(1U << index);
            }
        }
        else if (s_buttons[index].pressedLatch != 0U)
        {
            if (s_buttons[index].releaseMs < FW_RELEASE_MS)
            {
                ++s_buttons[index].releaseMs;
            }
            if (s_buttons[index].releaseMs >= FW_RELEASE_MS)
            {
                s_buttons[index].pressedLatch = 0U;
                s_buttons[index].releaseMs = 0U;
            }
        }
        else
        {
            s_buttons[index].releaseMs = 0U;
        }
    }

    return events;
}

static void Firmware_StopNow(void)
{
    s_mode = FW_PAUSED;
    s_elapsedMs = 0U;
}

static void Firmware_StartUp(void)
{
    s_elapsedMs = 0U;
    if (s_digit < FW_MAX_DIGIT)
    {
        ++s_digit;
        Firmware_MatrixSetDigit(s_digit);
    }
    s_mode = (s_digit < FW_MAX_DIGIT) ? FW_COUNTING_UP : FW_PAUSED;
}

static void Firmware_StartDown(void)
{
    s_elapsedMs = 0U;
    if (s_digit > FW_MIN_DIGIT)
    {
        --s_digit;
        Firmware_MatrixSetDigit(s_digit);
    }
    s_mode = (s_digit > FW_MIN_DIGIT) ? FW_COUNTING_DOWN : FW_PAUSED;
}

static void Firmware_AdvanceCounter(void)
{
    if (s_mode == FW_PAUSED)
    {
        return;
    }
    if (s_elapsedMs < FW_STEP_TIME_MS)
    {
        ++s_elapsedMs;
    }
    if (s_elapsedMs < FW_STEP_TIME_MS)
    {
        return;
    }
    s_elapsedMs = 0U;

    if (s_mode == FW_COUNTING_UP)
    {
        if (s_digit < FW_MAX_DIGIT)
        {
            ++s_digit;
            Firmware_MatrixSetDigit(s_digit);
        }
        if (s_digit >= FW_MAX_DIGIT)
        {
            s_mode = FW_PAUSED;
        }
    }
    else if (s_mode == FW_COUNTING_DOWN)
    {
        if (s_digit > FW_MIN_DIGIT)
        {
            --s_digit;
            Firmware_MatrixSetDigit(s_digit);
        }
        if (s_digit <= FW_MIN_DIGIT)
        {
            s_mode = FW_PAUSED;
        }
    }
}

void Firmware_Init(void)
{
    Board_ClockAndDebugInit();
    Firmware_MatrixGpioInit();
    Firmware_ButtonsInit();

    /* No boot animation and no input-blocking window: ready from the first tick. */
    s_digit = FW_INITIAL_DIGIT;
    s_mode = FW_PAUSED;
    s_elapsedMs = 0U;
    Firmware_MatrixSetDigit(s_digit);
}

void Firmware_Task1ms(void)
{
    uint8_t events;

    Firmware_MatrixScan();
    events = Firmware_ButtonEvents();

    /* A new STOP press has priority only on its event tick. A stuck-low or
       held STOP must not veto every later PA4/PA5 command forever. */
    if ((events & FW_EVENT_STOP) != 0U)
    {
        Firmware_StopNow();
        return;
    }
    if ((events & FW_EVENT_UP) != 0U)
    {
        Firmware_StartUp();
        return;
    }
    if ((events & FW_EVENT_DOWN) != 0U)
    {
        Firmware_StartDown();
        return;
    }
    Firmware_AdvanceCounter();
}

uint8_t Firmware_GetDigit(void)
{
    return s_digit;
}

FirmwareMode Firmware_GetMode(void)
{
    return s_mode;
}

uint32_t Firmware_GetElapsedMs(void)
{
    return s_elapsedMs;
}

int main(void)
{
    uint32_t ticks;
    uint32_t lastTick;
    uint32_t currentTick;

    Firmware_Init();

    ticks = SystemCoreClock / 1000U;
    if ((ticks == 0U) || (ticks > 0x01000000UL))
    {
        for (;;) { }
    }

    SysTick->CTRL = 0U;
    SysTick->LOAD = ticks - 1U;
    SysTick->VAL = 0U;
    SysTick->CTRL = SysTick_CTRL_CLKSOURCE_Msk |
                    SysTick_CTRL_TICKINT_Msk |
                    SysTick_CTRL_ENABLE_Msk;
    lastTick = system_tick;

    for (;;)
    {
        currentTick = system_tick;
        while (lastTick != currentTick)
        {
            Firmware_Task1ms();
            ++lastTick;
        }
    }
}
