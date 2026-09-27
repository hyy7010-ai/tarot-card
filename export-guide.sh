#!/bin/bash
# 把 guide.html 导成 A4 PDF。用法：npm run dev 之后 ./export-guide.sh
# 用无头 Chrome 而不是「打印」对话框：这样页边距、背景色、分页全都可复现。
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${PORT:-5173}"
OUT="${1:-真心塔罗-使用说明.pdf}"
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" --virtual-time-budget=12000 \
  "http://localhost:$PORT/guide.html" >/dev/null 2>&1
echo "  $OUT"
