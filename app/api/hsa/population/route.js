export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 社人研 令和5年推計を二次医療圏へ集約した年齢階級別将来人口(2020-2050)。?code=2606
// カルテ #28(人口推計)/#29(高齢化) の基礎データ。国勢調査(カルテ#4)・PDF#29生産年齢と一致検証済み。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'population_r5.json');
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
