#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print 'Node.js 24 LTS が必要です。README.md の起動手順を確認してください。'
  read -r '?Enterで終了します。'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --ignore-scripts || exit 1
fi
exec node scripts/start.mjs
