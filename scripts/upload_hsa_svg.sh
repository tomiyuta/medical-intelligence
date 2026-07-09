#!/usr/bin/env bash
# 医療圏カルテのスライドSVG（data/hsa/svg/ 25,064枚・~1.8GB）を Cloudflare R2 へ一括アップロード。
# プロキシ方式（バケット非公開）用に「生SVG」を同期する。変更分のみ転送。
#
# 前提: rclone インストール済み（brew install rclone）。以下の環境変数を設定:
#   R2_ACCOUNT_ID        Cloudflare アカウントID
#   R2_ACCESS_KEY_ID     R2 APIトークンのアクセスキー
#   R2_SECRET_ACCESS_KEY R2 APIトークンのシークレット
#   R2_BUCKET            バケット名（例 medintel-hsa）
#
# 使い方:
#   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=medintel-hsa \
#     bash scripts/upload_hsa_svg.sh
#   （--gzip を付けると事前gzip＋Content-Encoding付与＝公開リダイレクト方式向け）
set -euo pipefail

: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID が未設定}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID が未設定}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY が未設定}"
: "${R2_BUCKET:?R2_BUCKET が未設定}"

command -v rclone >/dev/null 2>&1 || { echo "rclone が必要です: brew install rclone"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/hsa/svg"
[ -d "$SRC" ] || { echo "SVGが見つかりません: $SRC （先に scripts/extract_hsa_svg.py を実行）"; exit 1; }

# rclone を環境変数だけで構成（設定ファイル不要）
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ACL=private

echo "→ $SRC を r2:${R2_BUCKET} へ同期（生SVG・変更分のみ）..."
COUNT=$(find "$SRC" -name '*.svg' | wc -l | tr -d ' ')
echo "  対象: ${COUNT} 枚"

if [ "${1:-}" = "--gzip" ]; then
  # 公開リダイレクト方式向け: 事前gzipして Content-Encoding: gzip を付与
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  echo "  gzip前処理中 → $TMP ..."
  (cd "$SRC" && find . -name '*.svg' -print0 | while IFS= read -r -d '' f; do
     mkdir -p "$TMP/$(dirname "$f")"; gzip -c "$f" > "$TMP/$f"; done)
  rclone sync "$TMP" "r2:${R2_BUCKET}" \
    --header-upload "Content-Type: image/svg+xml" \
    --header-upload "Content-Encoding: gzip" \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --transfers 32 --checkers 32 --progress
else
  # プロキシ方式（推奨）: 生SVGをそのまま同期
  rclone sync "$SRC" "r2:${R2_BUCKET}" \
    --header-upload "Content-Type: image/svg+xml" \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --transfers 32 --checkers 32 --progress
fi

echo "✓ 完了。Vercel に R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET を設定し再デプロイしてください。"
