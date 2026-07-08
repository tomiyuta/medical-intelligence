export const dynamic = "force-dynamic";
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 1スライドの SVG（テキスト保持）を返す。?code=2606&page=5
// code/page は数字のみに制限（パストラバーサル防止）。
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const page = searchParams.get('page');
  if (!/^\d{3,5}$/.test(code || '') || !/^\d{1,3}$/.test(page || '')) {
    return new Response('bad request', { status: 400 });
  }
  const fn = `p${String(page).padStart(2, '0')}.svg`;
  const path = join(process.cwd(), 'data', 'hsa', 'svg', code, fn);
  if (!existsSync(path)) return new Response('not found', { status: 404 });
  const svg = readFileSync(path, 'utf-8');
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
