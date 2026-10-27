#include "buttons.h"
#include "stm32f10x.h"

/* Pin masks are defined locally on purpose: GPIO_Pin_x belongs to the SPL
   gpio header, while this firmware intentionally requires CMSIS only. */
#define BUTTON_UP_PIN       (0x0010U)   /* PA4 */
#define BUTTON_DOWN_PIN     (0x0020U)   /* PA5 */
#define BUTTON_STOP_PIN     (0x0040U)   /* PA6 */
#define BUTTON_UNUSED_PIN   (0x0080U)   /* PA7 */

typedef struct
{
    uint16_t pin;
    uint8_t stableHigh;
    uint8_t debounceMs;
} DebouncedButton;

/* Buttons connect GPIO to 3.3 V when pressed, so inputs are active-HIGH
   and use internal pull-downs. PA6 STOP is intentionally not debounced in
   the application timing path; it is sampled directly every millisecond. */
static DebouncedButton s_directionButtons[2] =
{
    { BUTTON_UP_PIN, 0U, 0U },   /* PA4: UP, generates BUTTON_EVENT_UP */
    { BUTTON_DOWN_PIN, 0U, 0U }  /* PA5: DOWN, generates BUTTON_EVENT_DOWN */
};

static void Buttons_ConfigPullDown(uint8_t pin)
{
    uint32_t shift = (uint32_t)(pin & 0x07U) * 4U;

    /* CRL: MODE=00 input, CNF=10 pull-up/pull-down => nibble 0x8. */
    GPIOA->CRL = (GPIOA->CRL & ~(0x0FUL << shift)) | (0x08UL << shift);
}

void Buttons_Init(void)
{
    /* ODR=0 selects the internal pull-down for PA4, PA5, PA6 and PA7. */
    GPIOA->ODR &= (uint32_t)~(BUTTON_UP_PIN | BUTTON_DOWN_PIN |
                               BUTTON_STOP_PIN | BUTTON_UNUSED_PIN);
    Buttons_ConfigPullDown(4U);
    Buttons_ConfigPullDown(5U);
    Buttons_ConfigPullDown(6U);

    /* The pictured fourth key (PA7) has no specified action. Configure a
       safe idle input but deliberately do not generate an event for it. */
    Buttons_ConfigPullDown(7U);

    s_directionButtons[0].stableHigh = 0U;
    s_directionButtons[0].debounceMs = 0U;
    s_directionButtons[1].stableHigh = 0U;
    s_directionButtons[1].debounceMs = 0U;
}

uint8_t Buttons_Scan1ms(void)
{
    uint8_t events = 0U;
    uint8_t index;

    for (index = 0U; index < 2U; ++index)
    {
        uint8_t rawHigh = (GPIOA->IDR & s_directionButtons[index].pin) ? 1U : 0U;

        if (rawHigh == s_directionButtons[index].stableHigh)
        {
            s_directionButtons[index].debounceMs = 0U;
        }
        else
        {
            if (s_directionButtons[index].debounceMs < BUTTON_DEBOUNCE_MS)
            {
                ++s_directionButtons[index].debounceMs;
            }

            if (s_directionButtons[index].debounceMs >= BUTTON_DEBOUNCE_MS)
            {
                s_directionButtons[index].stableHigh = rawHigh;
                s_directionButtons[index].debounceMs = 0U;
                if (rawHigh != 0U)
                {
                    events |= (uint8_t)(1U << index);
                }
            }
        }
    }

    return events;
}

uint8_t Buttons_StopIsPressed(void)
{
    return (GPIOA->IDR & BUTTON_STOP_PIN) ? 1U : 0U;
}
