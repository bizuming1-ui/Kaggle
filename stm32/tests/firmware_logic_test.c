#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "matrix_firmware.h"
#include "stm32f10x.h"

GPIO_TypeDef mock_gpioa;
GPIO_TypeDef mock_gpiob;
RCC_TypeDef mock_rcc;
AFIO_TypeDef mock_afio;
SysTick_Type mock_systick;
uint32_t SystemCoreClock = 72000000U;

void SystemCoreClockUpdate(void) { }
uint32_t SysTick_Config(uint32_t ticks) { (void)ticks; return 0U; }

static void reset_firmware(void)
{
    memset(&mock_gpioa, 0, sizeof(mock_gpioa));
    memset(&mock_gpiob, 0, sizeof(mock_gpiob));
    /* The photographed buttons connect to GND. Model released contacts as
       HIGH, as established by the firmware's internal pull-ups. */
    mock_gpioa.IDR = GPIO_Pin_4 | GPIO_Pin_5 | GPIO_Pin_6 | GPIO_Pin_7;
    Firmware_Init();
}

static void ticks(uint32_t count)
{
    uint32_t i;
    for (i = 0U; i < count; ++i) Firmware_Task1ms();
}

static void set_pin(uint16_t pin, int high)
{
    if (high) mock_gpioa.IDR |= pin;
    else mock_gpioa.IDR &= (uint32_t)~pin;
}

static void press_immediate(uint16_t pin)
{
    set_pin(pin, 0);              /* active LOW: contact connects to GND */
    ticks(1U);                    /* first LOW sample must already step */
}

static void release_debounced(uint16_t pin)
{
    set_pin(pin, 1);              /* released: internal pull-up drives HIGH */
    ticks(FW_RELEASE_MS);
}

static void test_scan_and_idle_polarity(void)
{
    uint8_t column;
    reset_firmware();
    assert(mock_gpiob.ODR == 0x0000FF00UL);
    assert((mock_gpioa.ODR & 0x00F0UL) == 0x00F0UL); /* pull-ups selected */
    assert((mock_gpioa.CRL & 0xFFFF0000UL) == 0x88880000UL);
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);

    for (column = 0U; column < 8U; ++column)
    {
        Firmware_Task1ms();
        assert((mock_gpiob.ODR & 0xFFU) == ((uint32_t)1U << column));
        /* Digit 1, C1/C2/C8 have no pixels: their rows stay all HIGH. */
        if ((column == 0U) || (column == 1U) || (column == 7U))
        {
            assert(((mock_gpiob.ODR >> 8) & 0xFFU) == 0xFFU);
        }
    }
    assert(Firmware_GetDigit() == 1U);       /* released HIGH inputs create no event */
    assert(Firmware_GetMode() == FW_PAUSED);
}

static void test_immediate_up_and_stop_before_next_step(void)
{
    reset_firmware();
    assert(Firmware_GetMode() == FW_PAUSED);
    assert(Firmware_GetDigit() == 1U);
    set_pin(GPIO_Pin_4, 0);       /* press PA4 to GND */
    ticks(1U);                    /* immediate momentary HIGH -> LOW sample */
    assert(Firmware_GetMode() == FW_COUNTING_UP);
    assert(Firmware_GetDigit() == 2U); /* immediate first step, not +500 ms */
    assert(Firmware_GetElapsedMs() == 0U);

    ticks(FW_STEP_TIME_MS - 1U);
    assert(Firmware_GetDigit() == 2U);
    set_pin(GPIO_Pin_6, 0);       /* raw STOP has priority on this very tick */
    ticks(1U);
    assert(Firmware_GetMode() == FW_PAUSED);
    assert(Firmware_GetDigit() == 2U); /* no unintended increment to 3 */
    assert(Firmware_GetElapsedMs() == 0U);
    ticks(1000U);
    assert(Firmware_GetDigit() == 2U);

    set_pin(GPIO_Pin_6, 1);
    release_debounced(GPIO_Pin_4);
    assert(Firmware_GetMode() == FW_PAUSED);
}

static void test_short_tap_bounce_and_rearm(void)
{
    reset_firmware();
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U); /* a 1 ms active sample is enough */

    /* A short HIGH bounce does not re-arm the latched key. */
    set_pin(GPIO_Pin_4, 1);
    ticks(5U);
    set_pin(GPIO_Pin_4, 0);
    ticks(1U);
    assert(Firmware_GetDigit() == 2U);

    /* Likewise, 19 ms HIGH is insufficient; another LOW is still the same
       physical press and must not produce a second immediate increment. */
    set_pin(GPIO_Pin_4, 1);
    ticks(FW_RELEASE_MS - 1U);
    set_pin(GPIO_Pin_4, 0);
    ticks(1U);
    assert(Firmware_GetDigit() == 2U);

    /* A continuous 20 ms HIGH release rearms exactly one next press. */
    set_pin(GPIO_Pin_4, 1);
    ticks(FW_RELEASE_MS);
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 3U);
    release_debounced(GPIO_Pin_4);
}

static void test_full_up_and_down_ranges(void)
{
    uint8_t expected;
    reset_firmware();

    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U); /* immediate 1 -> 2 */
    for (expected = 3U; expected <= 9U; ++expected)
    {
        ticks(FW_STEP_TIME_MS);
        assert(Firmware_GetDigit() == expected);
    }
    assert(Firmware_GetMode() == FW_PAUSED);
    ticks(2000U);
    assert(Firmware_GetDigit() == 9U); /* saturated, never wraps to 0/1 */
    release_debounced(GPIO_Pin_4);

    /* A new UP command at the upper boundary stays at 9. */
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 9U);
    assert(Firmware_GetMode() == FW_PAUSED);
    release_debounced(GPIO_Pin_4);

    press_immediate(GPIO_Pin_5);
    assert(Firmware_GetDigit() == 8U); /* immediate 9 -> 8 */
    for (expected = 7U; expected >= 1U; --expected)
    {
        ticks(FW_STEP_TIME_MS);
        assert(Firmware_GetDigit() == expected);
    }
    assert(Firmware_GetMode() == FW_PAUSED);
    ticks(2000U);
    assert(Firmware_GetDigit() == 1U); /* saturated, never wraps to 9 */
    release_debounced(GPIO_Pin_5);

    /* A new DOWN command at the lower boundary stays at 1. */
    press_immediate(GPIO_Pin_5);
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);
    release_debounced(GPIO_Pin_5);
}

static void test_momentary_release_does_not_cancel_counting(void)
{
    reset_firmware();
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U);

    /* The key is a momentary contact: releasing it must not cancel the mode
       or require the user to hold it for the automatic counting interval. */
    release_debounced(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U);
    assert(Firmware_GetMode() == FW_COUNTING_UP);
    assert(Firmware_GetElapsedMs() == FW_RELEASE_MS);

    ticks(FW_STEP_TIME_MS - FW_RELEASE_MS);
    assert(Firmware_GetDigit() == 3U);
    set_pin(GPIO_Pin_6, 0);
    ticks(1U);
    assert(Firmware_GetMode() == FW_PAUSED);
    assert(Firmware_GetDigit() == 3U);
    set_pin(GPIO_Pin_6, 1);
}

static void test_pause_resume_and_pa7_is_unused(void)
{
    reset_firmware();
    set_pin(GPIO_Pin_7, 0);
    ticks(1000U);
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);
    set_pin(GPIO_Pin_7, 1);

    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U);
    ticks(250U);
    set_pin(GPIO_Pin_6, 0);
    ticks(1U);
    assert(Firmware_GetDigit() == 2U);
    assert(Firmware_GetMode() == FW_PAUSED);
    set_pin(GPIO_Pin_6, 1);
    release_debounced(GPIO_Pin_4);
    ticks(1000U);
    assert(Firmware_GetDigit() == 2U); /* releasing STOP never auto-resumes */

    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 3U); /* resume also gives immediate feedback */
    assert(Firmware_GetElapsedMs() == 0U);
    ticks(FW_STEP_TIME_MS);
    assert(Firmware_GetDigit() == 4U);
    release_debounced(GPIO_Pin_4);
}

int main(void)
{
    test_scan_and_idle_polarity();
    test_immediate_up_and_stop_before_next_step();
    test_short_tap_bounce_and_rearm();
    test_full_up_and_down_ranges();
    test_momentary_release_does_not_cancel_counting();
    test_pause_resume_and_pa7_is_unused();
    puts("firmware logic: PASS (scan, 1 ms active-LOW steps, press latch, 20 ms release re-arm, stop, 1..9 saturation, PA7 unused)");
    return 0;
}
