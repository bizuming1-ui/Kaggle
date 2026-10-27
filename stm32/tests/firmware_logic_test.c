#include <assert.h>
#include <stdio.h>
#include <string.h>

/* Include the exact delivered implementation so this test needs no copied
   production API header. Only the entry symbol is renamed for the host. */
#define main Firmware_MainForTest
#include "../project/code/User/main.c"
#undef main

GPIO_TypeDef mock_gpioa;
GPIO_TypeDef mock_gpiob;
RCC_TypeDef mock_rcc;
AFIO_TypeDef mock_afio;
SysTick_Type mock_systick;
uint32_t SystemCoreClock = 72000000U;

void SystemCoreClockUpdate(void) { }
uint32_t SysTick_Config(uint32_t ticks) { (void)ticks; return 0U; }

static void reset_hardware(void)
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

static void reset_firmware(void)
{
    reset_hardware();  /* no boot delay: normal 1 + paused state immediately */
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

static void test_ready_from_first_tick_without_boot_animation(void)
{
    reset_hardware();
    assert(mock_gpiob.ODR == 0x0000FF00UL); /* no column selected before 1 ms task */
    assert(Firmware_GetDigit() == 1U);       /* new build boots directly to 1, not 8 */
    assert(Firmware_GetMode() == FW_PAUSED);
    set_pin(GPIO_Pin_4, 0);
    ticks(1U);                              /* no input-blocking startup window */
    assert(Firmware_GetDigit() == 2U);
    assert(Firmware_GetMode() == FW_COUNTING_UP);

    reset_hardware();
    ticks(512U);                            /* remains ready; never inserts an 8 */
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);
    assert(Firmware_GetElapsedMs() == 0U);
}

static void test_scan_and_idle_polarity(void)
{
    uint8_t column;
    uint8_t selected;
    uint8_t firstColumn;
    reset_firmware();
    firstColumn = s_scanColumn;
    assert((mock_gpioa.ODR & 0x00F0UL) == 0x00F0UL); /* pull-ups selected */
    assert((mock_gpioa.CRL & 0xFFFF0000UL) == 0x88880000UL);
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);

    for (column = 0U; column < 8U; ++column)
    {
        Firmware_Task1ms();
        selected = (uint8_t)((firstColumn + column) % 8U);
        assert((mock_gpiob.ODR & 0xFFU) == ((uint32_t)1U << selected));
        /* Digit 1, C1/C2/C8 have no pixels: their rows stay all HIGH. */
        if ((selected == 0U) || (selected == 1U) || (selected == 7U))
        {
            assert(((mock_gpiob.ODR >> 8) & 0xFFU) == 0xFFU);
        }
    }
    assert(s_scanColumn == firstColumn);  /* exactly one complete 8-column frame */
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

static void test_stuck_stop_cannot_veto_up_and_event_priority(void)
{
    reset_firmware();
    set_pin(GPIO_Pin_6, 0);       /* STOP is already low from the first tick */
    ticks(1U);                    /* consume exactly one initial STOP event */
    assert(Firmware_GetDigit() == 1U);
    assert(Firmware_GetMode() == FW_PAUSED);

    set_pin(GPIO_Pin_4, 0);       /* PA6 remains stuck low */
    ticks(1U);
    assert(Firmware_GetDigit() == 2U); /* held STOP cannot veto this new UP event */
    assert(Firmware_GetMode() == FW_COUNTING_UP);
    ticks(FW_STEP_TIME_MS);
    assert(Firmware_GetDigit() == 3U);

    set_pin(GPIO_Pin_4, 1);
    set_pin(GPIO_Pin_6, 1);
    ticks(FW_RELEASE_MS);         /* re-arm both keys */
    set_pin(GPIO_Pin_4, 0);
    set_pin(GPIO_Pin_6, 0);       /* fresh simultaneous UP + STOP events */
    ticks(1U);
    assert(Firmware_GetDigit() == 3U); /* STOP still wins on its event tick */
    assert(Firmware_GetMode() == FW_PAUSED);
    set_pin(GPIO_Pin_4, 1);
    set_pin(GPIO_Pin_6, 1);
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

    /* One momentary PA4 press, released immediately: 1 -> 2 -> ... -> 8. */
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 2U);
    release_debounced(GPIO_Pin_4);
    ticks(FW_STEP_TIME_MS - FW_RELEASE_MS);
    assert(Firmware_GetDigit() == 3U); /* 500 ms after the immediate first step */
    for (expected = 4U; expected <= 8U; ++expected)
    {
        ticks(FW_STEP_TIME_MS);
        assert(Firmware_GetDigit() == expected);
    }
    assert(Firmware_GetMode() == FW_PAUSED);
    ticks(2000U);
    assert(Firmware_GetDigit() == 8U); /* saturated, never displays 9 or wraps */

    /* A new UP command at the upper boundary stays at 8. */
    press_immediate(GPIO_Pin_4);
    assert(Firmware_GetDigit() == 8U);
    assert(Firmware_GetMode() == FW_PAUSED);
    release_debounced(GPIO_Pin_4);

    /* One momentary PA5 press, released immediately: 8 -> 7 -> ... -> 1. */
    press_immediate(GPIO_Pin_5);
    assert(Firmware_GetDigit() == 7U);
    release_debounced(GPIO_Pin_5);
    ticks(FW_STEP_TIME_MS - FW_RELEASE_MS);
    assert(Firmware_GetDigit() == 6U);
    for (expected = 5U; expected >= 1U; --expected)
    {
        ticks(FW_STEP_TIME_MS);
        assert(Firmware_GetDigit() == expected);
    }
    assert(Firmware_GetMode() == FW_PAUSED);
    ticks(2000U);
    assert(Firmware_GetDigit() == 1U); /* saturated, never wraps to 8 */

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
    test_ready_from_first_tick_without_boot_animation();
    test_scan_and_idle_polarity();
    test_immediate_up_and_stop_before_next_step();
    test_stuck_stop_cannot_veto_up_and_event_priority();
    test_short_tap_bounce_and_rearm();
    test_full_up_and_down_ranges();
    test_momentary_release_does_not_cancel_counting();
    test_pause_resume_and_pa7_is_unused();
    puts("firmware logic: PASS (direct 1 boot, full 1..8/8..1 timelines, momentary PA6 event priority, stuck-low STOP cannot veto PA4, 20 ms re-arm, PA7 unused)");
    return 0;
}
