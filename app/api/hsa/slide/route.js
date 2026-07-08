export const dynamic = "force-dynamic";
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 1スライドの SVG（テキスト保持）を返す。?code=2606&page=5
// 配信優先: 環境変数 HSA_SVG_BASE_URL(外部CDN/R2) → ローカル data/hsa/svg → 準備中プレースホルダ。
// code/page は数字のみに制限（パストラバーサル防止）。
function placeholder(msg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540" width="720" height="540">` +
    `<rect width="720" height="540" fill="#f6f8fa"/>` +
    `<text x="360" y="266" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="20" fill="#94a3b8">${msg}</text>` +
    `<text x="360" y="296" text-anchor="middle" font-family="Hiragino Sans,sans-serif" font-size="13" fill="#cbd5e1">スライド画像は外部ストレージ配信の設定後に表示されます</text></svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const page = searchParams.get('page');
  if (!/^\d{3,5}$/.test(code || '') || !/^\d{1,3}$/.test(page || '')) {
    return new Response('bad request', { status: 400 });
  }
  const fn = `p${String(page).padStart(2, '0')}.svg`;

  // 外部CDN/R2 が設定されていればそちらへ委譲
  const base = process.env.HSA_SVG_BASE_URL;
  if (base) {
    return Response.redirect(`${base.replace(/\/$/, '')}/${code}/${fn}`, 307);
  }
  // ローカル抽出物
  const path = join(process.cwd(), 'data', 'hsa', 'svg', code, fn);
  if (!existsSync(path)) return placeholder('スライド準備中');
  const svg = readFileSync(path, 'utf-8');
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
