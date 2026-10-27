#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$(mktemp -d /tmp/f103-firmware-test.XXXXXX)"
trap 'rm -rf "$BUILD"' EXIT

CC="${CC:-gcc}"
CFLAGS=(-std=c99 -Wall -Wextra -Werror -pedantic -Wshadow -Wundef)
INCLUDES=(
  -I"$ROOT/stm32/tests/firmware_stub"
  -I"$ROOT/stm32/project/code/User"
)

# Test the exact self-contained main.c, with only its entry point renamed so
# the host test can supply its own main(). No legacy Hardware module is linked.
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" -Dmain=Firmware_MainForTest \
  -c "$ROOT/stm32/project/code/User/main.c" -o "$BUILD/main_testable.o"
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  "$BUILD/main_testable.o" \
  "$ROOT/stm32/project/code/User/stm32f10x_it.c" \
  "$ROOT/stm32/tests/firmware_logic_test.c" -o "$BUILD/firmware_logic_test"
"$BUILD/firmware_logic_test"

# Also compile the production entry point and supplied interrupt source.
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  -c "$ROOT/stm32/project/code/User/main.c" -o "$BUILD/main.o"
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  -c "$ROOT/stm32/project/code/User/stm32f10x_it.c" -o "$BUILD/stm32f10x_it.o"
if command -v nm >/dev/null 2>&1; then
  nm "$BUILD/main.o" | grep -Eq '[[:space:]]U[[:space:]]system_tick$'
  nm "$BUILD/stm32f10x_it.o" | grep -Eq '[[:space:]][BCD][[:space:]]system_tick$'
  if nm "$BUILD/main.o" | grep -Eq '[[:space:]]U[[:space:]](App_|Buttons_|Matrix_)'; then
    echo "self-contained main unexpectedly references a legacy Hardware object" >&2
    exit 1
  fi
  echo "single system_tick definition and self-contained main: PASS"
fi
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  "$ROOT/stm32/project/code/User/stm32f10x_it.c" \
  "$ROOT/stm32/tests/systick_logic_test.c" -o "$BUILD/systick_logic_test"
"$BUILD/systick_logic_test"
echo "main.c and stm32f10x_it.c host syntax/register compilation: PASS"
