export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 医療圏カルテ manifest。
// 引数なし   : 選択用の軽量圏域一覧（slides を除く）＋都道府県リスト
// ?code=2606 : 当該圏域の全スライドメタ（章・タイトル）
// data/hsa/ はローカル抽出物（.gitignore/.vercelignore 済み）。未抽出なら ready:false。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'hsa', 'manifest.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

export async function GET(request) {
  const m = load();
  if (!m) {
    return NextResponse.json({
      ready: false,
      message: '医療圏カルテは未抽出です。`python3 scripts/extract_hsa_svg.py` を実行してください。',
      areas: [], prefectures: [], count: 0,
    });
  }
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (code) {
    const area = m.areas.find(a => a.code === code);
    if (!area) return NextResponse.json({ ready: true, area: null }, { status: 404 });
    return NextResponse.json({ ready: true, area });
  }
  // 軽量一覧（slides 除外）
  const areas = m.areas.map(({ slides, ...rest }) => rest);
  return NextResponse.json({
    ready: true,
    source: m.source,
    note: m.note,
    count: m.count,
    prefectures: m.prefectures,
    areas,
  });
}
