#!/bin/bash
# Assemble the installer from the built .sdPlugin (run `npm run build` first).
#   bash package.sh          -> dist/com.4xsdev.axis-gateway.streamDeckPlugin        (Marketplace build, no Ko-fi key)
#   bash package.sh --kofi   -> dist/com.4xsdev.axis-gateway-kofi.streamDeckPlugin   (GitHub build, adds the Ko-fi key)
# Elgato's guidelines forbid donation links inside plugins, so only the GitHub build lists the Ko-fi action.
set -euo pipefail
cd "$(dirname "$0")"
P=com.4xsdev.axis-gateway.sdPlugin
OUT=com.4xsdev.axis-gateway.streamDeckPlugin
rm -rf dist/$P && mkdir -p dist/$P
cp -R $P/. dist/$P/
if [[ "${1:-}" == "--kofi" ]]; then
  OUT=com.4xsdev.axis-gateway-kofi.streamDeckPlugin
  cp -R kofi/ui/. dist/$P/ui/
  cp -R kofi/imgs/. dist/$P/imgs/
  python3 - dist/$P/manifest.json kofi/action.json <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); a=json.load(open(sys.argv[2]))
m["Actions"]=[x for x in m["Actions"] if x["UUID"]!=a["UUID"]]+[a]
json.dump(m,open(sys.argv[1],"w"),indent=2,ensure_ascii=False)
PY
fi
( cd dist && rm -f $OUT && zip -qr $OUT $P -x '*.DS_Store' )
rm -rf dist/$P
echo "dist/$OUT"
