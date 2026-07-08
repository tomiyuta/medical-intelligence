export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 要介護(要支援)認定者数の将来推計(2020-2050, 要介護度別)。?code=2606
// = 都道府県認定率(介護保険事業状況報告R5) × 圏将来人口(社人研)。医療需給総覧#52,53の手法。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'care_projection_r5.json');
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
  return NextResponse.json({ ready: true, source: data.source, note: data.note, levels: data.levels, years: data.years, code, area });
}
