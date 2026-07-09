export const dynamic = "force-dynamic";
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AwsClient } from 'aws4fetch';

// 1スライドの SVG（テキスト保持）を返す。?code=2606&page=5
// 配信優先: (1) R2プロキシ(R2_* env・バケット非公開・CORS不要) → (2) HSA_SVG_BASE_URL リダイレクト
//           → (3) ローカル data/hsa/svg → (4) 準備中プレースホルダ。
// code/page は数字のみに制限（パストラバーサル防止）。
const SVG_HEADERS = { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' };

function placeholder(msg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540" width="720" height="540">` +
    `<rect width="720" height="540" fill="#f6f8fa"/>` +
    `<text x="360" y="266" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="20" fill="#94a3b8">${msg}</text>` +
    `<text x="360" y="296" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="13" fill="#cbd5e1">スライド画像は外部ストレージ配信の設定後に表示されます</text></svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

let _r2 = null;
function r2Client() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  if (!_r2) _r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
  return _r2;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const page = searchParams.get('page');
  if (!/^\d{3,5}$/.test(code || '') || !/^\d{1,3}$/.test(page || '')) {
    return new Response('bad request', { status: 400 });
  }
  const fn = `p${String(page).padStart(2, '0')}.svg`;

  // (1) R2 プロキシ（バケット非公開・同一オリジン配信・CORS不要）
  const client = r2Client();
  if (client && process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET) {
    const url = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${code}/${fn}`;
    try {
      const r = await client.fetch(url);
      if (r.ok) {
        const enc = r.headers.get('content-encoding');
        return new Response(r.body, { status: 200, headers: enc ? { ...SVG_HEADERS, 'Content-Encoding': enc } : SVG_HEADERS });
      }
    } catch { /* フォールバックへ */ }
    return placeholder('スライド準備中');
  }

  // (2) 外部CDN/公開R2 が設定されていればリダイレクト
  const base = process.env.HSA_SVG_BASE_URL;
  if (base) {
    return Response.redirect(`${base.replace(/\/$/, '')}/${code}/${fn}`, 307);
  }

  // (3) ローカル抽出物
  const path = join(process.cwd(), 'data', 'hsa', 'svg', code, fn);
  if (!existsSync(path)) return placeholder('スライド準備中');
  return new Response(readFileSync(path, 'utf-8'), { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
