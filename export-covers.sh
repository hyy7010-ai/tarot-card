#!/bin/bash
# 把小红书首图导成 1080×1440 的 PNG。
#
# 用法：先 npm run dev，然后 ./export-covers.sh
# 产出：covers/xhs-a-数据.png、covers/xhs-b-插画.png
#
# 用无头 Chrome 而不是手动截图：手动截很难对准 1080×1440，
# 差几个像素小红书就会再压一次，字会糊。
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${PORT:-5173}"
OUT="covers"
mkdir -p "$OUT"

shot () {
  local name="$1" file="$2"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1080,1440 \
    --screenshot="$OUT/$file" \
    --virtual-time-budget=4000 \
    "http://localhost:$PORT/xhs-covers.html?only=$name" >/dev/null 2>&1
  echo "  $OUT/$file  $(sips -g pixelWidth -g pixelHeight "$OUT/$file" 2>/dev/null | tail -2 | tr -d ' \n' | sed 's/pixelWidth:/ /;s/pixelHeight:/×/')"
}

echo "导出中（需要 dev server 在 :$PORT 上跑着）"
shot a "xhs-a-数据.png"
shot b "xhs-b-插画.png"
