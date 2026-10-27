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

# Compile main.c too, without linking a second host main() into the test.
"$CC" "${CFLAGS[@]}" "${INCLUDES[@]}" \
  -c "$ROOT/stm32/project/code/User/main.c" -o "$BUILD/main.o"
if command -v nm >/dev/null 2>&1; then
  nm "$BUILD/main.o" | grep -Eq '[[:space:]]system_tick$'
  echo "legacy system_tick definition: PASS"
fi
echo "main.c host syntax/register compilation: PASS"
