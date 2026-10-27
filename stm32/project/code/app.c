#include "app.h"
#include "buttons.h"
#include "matrix.h"

static uint8_t s_digit;
static AppMode s_mode;
static uint32_t s_elapsedMs;

static void App_StopNow(void)
{
    s_mode = APP_PAUSED;
    s_elapsedMs = 0U;
}

static void App_StartUp(void)
{
    s_elapsedMs = 0U;
    s_mode = (s_digit < APP_MAX_DIGIT) ? APP_COUNTING_UP : APP_PAUSED;
}

static void App_StartDown(void)
{
    s_elapsedMs = 0U;
    s_mode = (s_digit > APP_MIN_DIGIT) ? APP_COUNTING_DOWN : APP_PAUSED;
}

static void App_AdvanceCounter(void)
{
    if (s_mode == APP_PAUSED)
    {
        return;
    }

    if (s_elapsedMs < APP_STEP_TIME_MS)
    {
        ++s_elapsedMs;
    }
    if (s_elapsedMs < APP_STEP_TIME_MS)
    {
        return;
    }
    s_elapsedMs = 0U;

    if (s_mode == APP_COUNTING_UP)
    {
        if (s_digit < APP_MAX_DIGIT)
        {
            ++s_digit;
            Matrix_SetDigit(s_digit);
        }
        if (s_digit >= APP_MAX_DIGIT)
        {
            s_mode = APP_PAUSED;
        }
    }
    else if (s_mode == APP_COUNTING_DOWN)
    {
        if (s_digit > APP_MIN_DIGIT)
        {
            --s_digit;
            Matrix_SetDigit(s_digit);
        }
        if (s_digit <= APP_MIN_DIGIT)
        {
            s_mode = APP_PAUSED;
        }
    }
}

void App_Init(void)
{
    Matrix_Init();
    Buttons_Init();

    s_digit = APP_INITIAL_DIGIT;
    s_mode = APP_PAUSED;
    s_elapsedMs = 0U;
    Matrix_SetDigit(s_digit);
}

void App_Task1ms(void)
{
    uint8_t events;

    /* One new column per millisecond: 8 ms/frame, approximately 125 Hz. */
    Matrix_Scan1ms();

    /* Debounce direction keys every millisecond. PA6 is read raw below so
       STOP wins before any pending step can advance the current digit. */
    events = Buttons_Scan1ms();

    if (Buttons_StopIsPressed() != 0U)
    {
        App_StopNow();
        return;
    }

    /* Deterministic priority if both direction events arrive together:
       PA4 (UP) first, then PA5 (DOWN). A new command gets a full step period. */
    if ((events & BUTTON_EVENT_UP) != 0U)
    {
        App_StartUp();
        return;
    }
    if ((events & BUTTON_EVENT_DOWN) != 0U)
    {
        App_StartDown();
        return;
    }

    App_AdvanceCounter();
}

uint8_t App_GetDigit(void)
{
    return s_digit;
}

AppMode App_GetMode(void)
{
    return s_mode;
}

uint32_t App_GetElapsedMs(void)
{
    return s_elapsedMs;
}
