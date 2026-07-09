# 医療圏カルテのスライドSVGを本番配信する（Cloudflare R2）

ネイティブパネル・目次・全文検索は本番稼働済み。スライド画像（SVG 25,064枚・~1.8GB）だけが
未配信で「スライド準備中」プレースホルダになっている。これを Cloudflare R2 から配信する手順。

`slide` API の配信優先順位:
1. **R2プロキシ**（`R2_*` 環境変数）… バケット非公開・同一オリジン配信・CORS不要 ← **推奨**
2. `HSA_SVG_BASE_URL` リダイレクト … 公開バケット＋CORS
3. ローカル `data/hsa/svg`（開発時）
4. プレースホルダ

---

## 方式A: R2プロキシ（推奨・非公開・CORS不要・実質無料）

R2 の無料枠（ストレージ10GB/月・Class A/B操作・エグレス無料）に収まる。生SVG 1.8GB でも枠内。

### 1. R2バケットとAPIトークン
1. Cloudflareダッシュボード → R2 → **Create bucket**（例 `medintel-hsa`、公開設定は不要）
2. R2 → **Manage API Tokens** → Create（Object Read & Write）→ 表示される
   `Access Key ID` / `Secret Access Key` を控える。Account ID はR2概要ページに記載。

### 2. SVGをアップロード（変更分のみ・数分）
```bash
brew install rclone   # 未導入なら
R2_ACCOUNT_ID=xxxx R2_ACCESS_KEY_ID=xxxx R2_SECRET_ACCESS_KEY=xxxx R2_BUCKET=medintel-hsa \
  bash scripts/upload_hsa_svg.sh
```

### 3. Vercel に環境変数を設定
Project → Settings → Environment Variables に4つ（Production）:
```
R2_ACCOUNT_ID=xxxx
R2_ACCESS_KEY_ID=xxxx
R2_SECRET_ACCESS_KEY=xxxx
R2_BUCKET=medintel-hsa
```

### 4. 再デプロイ → 確認
```bash
curl -s "https://medical-intelligence-two.vercel.app/api/hsa/slide?code=2606&page=13" | head -c 80
# → <svg ...> が返れば成功（プレースホルダの "スライド準備中" でなければOK）
```
ブラウザでカルテを開くと、各スライドが遅延読込で表示される。R2は非公開のまま、
Vercel関数が取得して返す（`R2→Vercel` のエグレスは無料、`Vercel→ブラウザ` はエッジでgzip圧縮）。

---

## 方式B: 公開リダイレクト（CDNキャッシュ最重視・要CORS）

ブラウザがR2を直接取得。Vercel関数を経由しないため最速だが、公開バケット＋CORSが必要。

1. `bash scripts/upload_hsa_svg.sh --gzip`（事前gzip＋`Content-Encoding: gzip`付与、~170MBに）
2. R2バケットを **Public**（r2.dev もしくはカスタムドメイン）にする
3. バケットの **CORS policy** に本サイトのオリジンを許可:
   ```json
   [{ "AllowedOrigins": ["https://medical-intelligence-two.vercel.app"],
      "AllowedMethods": ["GET"], "AllowedHeaders": ["*"] }]
   ```
4. Vercel に `HSA_SVG_BASE_URL=https://<公開URL>` を設定（`R2_*` は設定しない）→ 再デプロイ

---

## コスト（方式A・R2無料枠内）
- ストレージ: 生1.8GB（無料枠10GB内）= **$0**
- エグレス（R2→Vercel）: **$0**（R2はエグレス無料）
- Class A/B操作: 初回25k PUT・以降GETは無料枠内で実質 **$0**
- Vercel: 関数実行＋帯域（ブラウザへは圧縮後~数KB/枚）は無料枠内

→ 個人確認用なら **実質 $0/月**。

## 更新（スライド再抽出時）
`scripts/extract_hsa_svg.py` を再実行後、`bash scripts/upload_hsa_svg.sh` を再実行すれば
**変更分だけ**同期される（`Cache-Control: immutable` のため既存はブラウザ/エッジキャッシュ済）。

## ライセンス注意
医療需給総覧は購入物の個人確認用。本番サイトが公開URLの場合、スライド画像を不特定多数へ
配信する形になる点は運用者の判断・責任範囲。方式A（非公開バケット＋プロキシ）でも、
サイト自体が公開なら閲覧は可能である点に留意。
