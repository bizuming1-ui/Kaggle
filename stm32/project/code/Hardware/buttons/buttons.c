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
    uint8_t pressedLatch;
    uint8_t releaseMs;
} DebouncedButton;

/* Match the supplied Proteus schematic: PA4/PA5/PA6 connect to GND when
   pressed. Internal pull-ups keep released inputs HIGH; a pressed input is
   LOW. PA6 STOP is sampled directly every millisecond without debounce. */
static DebouncedButton s_directionButtons[2] =
{
    { BUTTON_UP_PIN, 0U, 0U },   /* PA4: UP, generates BUTTON_EVENT_UP */
    { BUTTON_DOWN_PIN, 0U, 0U }  /* PA5: DOWN, generates BUTTON_EVENT_DOWN */
};

static void Buttons_ConfigPullUp(uint8_t pin)
{
    uint32_t shift = (uint32_t)(pin & 0x07U) * 4U;

    /* CRL: MODE=00 input, CNF=10 pull-up/pull-down => nibble 0x8.
       ODR=1 selects the internal pull-up; see Buttons_Init(). */
    GPIOA->CRL = (GPIOA->CRL & ~(0x0FUL << shift)) | (0x08UL << shift);
}

void Buttons_Init(void)
{
    /* ODR=1 selects internal pull-ups for PA4, PA5, PA6 and PA7. */
    GPIOA->ODR |= (uint32_t)(BUTTON_UP_PIN | BUTTON_DOWN_PIN |
                              BUTTON_STOP_PIN | BUTTON_UNUSED_PIN);
    Buttons_ConfigPullUp(4U);
    Buttons_ConfigPullUp(5U);
    Buttons_ConfigPullUp(6U);

    /* The pictured fourth key (PA7) has no specified action. Configure a
       safe idle input but deliberately do not generate an event for it. */
    Buttons_ConfigPullUp(7U);

    s_directionButtons[0].pressedLatch = 0U;
    s_directionButtons[0].releaseMs = 0U;
    s_directionButtons[1].pressedLatch = 0U;
    s_directionButtons[1].releaseMs = 0U;
}

uint8_t Buttons_Scan1ms(void)
{
    /* A momentary key must not be held for 20 ms before anything happens.
       The first active-LOW sample emits one event and latches the key.
       Further press bounce cannot emit another event. Twenty milliseconds
       of continuous HIGH is required only to release/re-arm the key. */
    uint8_t events = 0U;
    uint8_t index;

    for (index = 0U; index < 2U; ++index)
    {
        uint8_t rawPressed = (GPIOA->IDR & s_directionButtons[index].pin) ? 0U : 1U;

        if (rawPressed != 0U)
        {
            s_directionButtons[index].releaseMs = 0U;
            if (s_directionButtons[index].pressedLatch == 0U)
            {
                s_directionButtons[index].pressedLatch = 1U;
                events |= (uint8_t)(1U << index);
            }
        }
        else if (s_directionButtons[index].pressedLatch != 0U)
        {
            if (s_directionButtons[index].releaseMs < BUTTON_DEBOUNCE_MS)
            {
                ++s_directionButtons[index].releaseMs;
            }
            if (s_directionButtons[index].releaseMs >= BUTTON_DEBOUNCE_MS)
            {
                s_directionButtons[index].pressedLatch = 0U;
                s_directionButtons[index].releaseMs = 0U;
            }
        }
        else
        {
            s_directionButtons[index].releaseMs = 0U;
        }
    }

    return events;
}

uint8_t Buttons_StopIsPressed(void)
{
    /* The screenshot connects PA6 to GND while STOP is pressed. */
    return (GPIOA->IDR & BUTTON_STOP_PIN) ? 0U : 1U;
}
