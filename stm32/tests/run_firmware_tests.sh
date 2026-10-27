#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$(mktemp -d /tmp/f103-firmware-test.XXXXXX)"
trap 'rm -rf "$BUILD"' EXIT

CC="${CC:-gcc}"
CFLAGS=(-std=c99 -Wall -Wextra -Werror -pedantic -Wshadow -Wundef)
INCLUDES=(
  -I"$ROOT/stm32/tests/firmware_stub"
  -I"$ROOT/stm32/project/code/Hardware/app"
  -I"$ROOT/stm32/project/code/Hardware/buttons"
  -I"$ROOT/stm32/project/code/Hardware/matrix"
  -I"$ROOT/stm32/project/code/User"
)
SOURCES=(
  "$ROOT/stm32/project/code/Hardware/app/app.c"
  "$ROOT/stm32/project/code/Hardware/buttons/buttons.c"
  "$ROOT/stm32/project/code/Hardware/matrix/matrix.c"
)

"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  "${SOURCES[@]}" "$ROOT/stm32/tests/firmware_logic_test.c" \
  -o "$BUILD/firmware_logic_test"
"$BUILD/firmware_logic_test"

# Compile main.c and the supplied interrupt source without linking a second
# host main() into the application-state test.
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  -c "$ROOT/stm32/project/code/User/main.c" -o "$BUILD/main.o"
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  -c "$ROOT/stm32/project/code/User/stm32f10x_it.c" -o "$BUILD/stm32f10x_it.o"
if command -v nm >/dev/null 2>&1; then
  nm "$BUILD/main.o" | grep -Eq '[[:space:]]U[[:space:]]system_tick$'
  nm "$BUILD/stm32f10x_it.o" | grep -Eq '[[:space:]][BCD][[:space:]]system_tick$'
  echo "single system_tick definition and main reference: PASS"
fi
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  "$ROOT/stm32/project/code/User/stm32f10x_it.c" \
  "$ROOT/stm32/tests/systick_logic_test.c" -o "$BUILD/systick_logic_test"
"$BUILD/systick_logic_test"
echo "main.c and stm32f10x_it.c host syntax/register compilation: PASS"
