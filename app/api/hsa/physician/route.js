export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 医師偏在指標（令和6年1月公表版）。?code=2606 で当該圏＋同県内の全二次医療圏＋全国・閾値を返す。
// 医療需給総覧カルテ P.11/12 の一次ソース。数値一致検証済み。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'physician_distribution.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

export async function GET(request) {
  const d = load();
  if (!d) return NextResponse.json({ ready: false });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const base = {
    ready: true, source: d.source, sourceUrl: d.sourceUrl, note: d.note,
    national: d.nationalIndex, thresholds: { majority: d.majorityThreshold, minority: d.minorityThreshold },
    areaCount: d.areaCount,
  };
  if (!code) return NextResponse.json(base);
  const area = d.areas[code];
  if (!area) return NextResponse.json({ ...base, code, area: null }, { status: 404 });
  // 同県内の二次医療圏（PDF P.11 と同じ県内比較用）＋圏コード付与
  const prefCode = code.slice(0, 2);
  const siblings = Object.entries(d.areas)
    .filter(([c]) => c.slice(0, 2) === prefCode)
    .map(([c, a]) => ({ code: c, area: a.area, index: a.index, classification: a.classification, rank: a.rank }))
    .sort((x, y) => x.code.localeCompare(y.code));
  return NextResponse.json({
    ...base, code, area: { ...area, code },
    pref: area.pref, prefIndex: area.prefIndex, siblings,
  });
}
