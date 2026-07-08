export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 受療率法による将来医療需要(1日平均患者数, 入院/外来, ICD大分類別)。?code=2606
// = 都道府県受療率(患者調査R5) × 圏将来人口(社人研)。医療需給総覧#30-36の手法。
// ※参考推計: 年齢不詳(患者調査総数に含む)・流出入調整の有無でカルテの絶対値とは差が出るため、需要トレンドを主軸に用いる。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'demand_projection_r5.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

export async function GET(request) {
  const data = load();
  if (!data) return NextResponse.json({ ready: false, area: null });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ ready: true, source: data.source, years: data.years, areaCount: data.areaCount });
  const area = data.areas[code] || null;
  return NextResponse.json({ ready: true, source: data.source, note: data.note, years: data.years, code, area });
}
