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
# 插画帖（5 张，按发布顺序）
shot b "post1-1-高塔.png"
shot c "post1-2-九宫格.png"
shot d "post1-3-四条规矩.png"
shot e "post1-4-恋人.png"
shot f "post1-5-宝剑三.png"
# 产品帖：只有封面能预先做，图2-5 是应用截图，必须等有真实数据
shot a "post2-1-封面.png"
