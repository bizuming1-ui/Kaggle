#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "app.h"
#include "buttons.h"
#include "stm32f10x.h"

GPIO_TypeDef mock_gpioa;
GPIO_TypeDef mock_gpiob;
RCC_TypeDef mock_rcc;
AFIO_TypeDef mock_afio;
uint32_t SystemCoreClock = 72000000U;

void SystemCoreClockUpdate(void) { }
uint32_t SysTick_Config(uint32_t ticks) { (void)ticks; return 0U; }

static void reset_firmware(void)
{
    memset(&mock_gpioa, 0, sizeof(mock_gpioa));
    memset(&mock_gpiob, 0, sizeof(mock_gpiob));
    App_Init();
}

static void ticks(uint32_t count)
{
    uint32_t i;
    for (i = 0U; i < count; ++i) App_Task1ms();
}

static void set_pin(uint16_t pin, int high)
{
    if (high) mock_gpioa.IDR |= pin;
    else mock_gpioa.IDR &= (uint32_t)~pin;
}

static void press_debounced(uint16_t pin)
{
    set_pin(pin, 1);
    ticks(BUTTON_DEBOUNCE_MS);
}

static void release_debounced(uint16_t pin)
{
    set_pin(pin, 0);
    ticks(BUTTON_DEBOUNCE_MS);
}

static void test_scan_and_idle_polarity(void)
{
    uint8_t column;
    reset_firmware();
    assert(mock_gpiob.ODR == 0x0000FF00UL);
    assert(App_GetDigit() == 1U);
    assert(App_GetMode() == APP_PAUSED);

    for (column = 0U; column < 8U; ++column)
    {
        App_Task1ms();
        assert((mock_gpiob.ODR & 0xFFU) == ((uint32_t)1U << column));
        /* Digit 1, C1/C2/C8 have no pixels: their rows stay all HIGH. */
        if ((column == 0U) || (column == 1U) || (column == 7U))
        {
            assert(((mock_gpiob.ODR >> 8) & 0xFFU) == 0xFFU);
        }
    }
}

static void test_debounce_up_and_stop_before_step(void)
{
    reset_firmware();
    set_pin(GPIO_Pin_4, 1);
    ticks(BUTTON_DEBOUNCE_MS - 1U);
    assert(App_GetMode() == APP_PAUSED);
    assert(App_GetDigit() == 1U);
    ticks(1U);
    assert(App_GetMode() == APP_COUNTING_UP);

    ticks(APP_STEP_TIME_MS - 1U);
    assert(App_GetDigit() == 1U);
    set_pin(GPIO_Pin_6, 1);       /* raw STOP has priority on this very tick */
    ticks(1U);
    assert(App_GetMode() == APP_PAUSED);
    assert(App_GetDigit() == 1U); /* no unintended increment to 2 */
    assert(App_GetElapsedMs() == 0U);
    ticks(1000U);
    assert(App_GetDigit() == 1U);

    set_pin(GPIO_Pin_6, 0);
    release_debounced(GPIO_Pin_4);
    assert(App_GetMode() == APP_PAUSED);
}

static void test_full_up_and_down_ranges(void)
{
    uint8_t expected;
    reset_firmware();
    press_debounced(GPIO_Pin_4);
    for (expected = 2U; expected <= 9U; ++expected)
    {
        ticks(APP_STEP_TIME_MS);
        assert(App_GetDigit() == expected);
    }
    assert(App_GetMode() == APP_PAUSED);
    ticks(2000U);
    assert(App_GetDigit() == 9U); /* saturated, never wraps to 0/1 */
    release_debounced(GPIO_Pin_4);

    press_debounced(GPIO_Pin_5);
    for (expected = 8U; expected >= 1U; --expected)
    {
        ticks(APP_STEP_TIME_MS);
        assert(App_GetDigit() == expected);
    }
    assert(App_GetMode() == APP_PAUSED);
    ticks(2000U);
    assert(App_GetDigit() == 1U); /* saturated, never wraps to 9 */
    release_debounced(GPIO_Pin_5);
}

static void test_pause_resume_and_pa7_is_unused(void)
{
    reset_firmware();
    set_pin(GPIO_Pin_7, 1);
    ticks(1000U);
    assert(App_GetDigit() == 1U);
    assert(App_GetMode() == APP_PAUSED);
    set_pin(GPIO_Pin_7, 0);

    press_debounced(GPIO_Pin_4);
    ticks(250U);
    set_pin(GPIO_Pin_6, 1);
    ticks(1U);
    assert(App_GetDigit() == 1U);
    assert(App_GetMode() == APP_PAUSED);
    set_pin(GPIO_Pin_6, 0);
    release_debounced(GPIO_Pin_4);
    ticks(1000U);
    assert(App_GetDigit() == 1U); /* releasing STOP never auto-resumes */

    press_debounced(GPIO_Pin_4);
    ticks(APP_STEP_TIME_MS);
    assert(App_GetDigit() == 2U); /* resume gets a complete fresh interval */
    release_debounced(GPIO_Pin_4);
}

int main(void)
{
    test_scan_and_idle_polarity();
    test_debounce_up_and_stop_before_step();
    test_full_up_and_down_ranges();
    test_pause_resume_and_pa7_is_unused();
    puts("firmware logic: PASS (scan, polarity, debounce, stop, 1..9 saturation, PA7 unused)");
    return 0;
}
