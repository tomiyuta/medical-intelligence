export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 入院患者数と平均在院日数の推移(カルテ#17)。病院報告 二次医療圏編 2013/2018/2023。
let cache = null;
function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'data', 'static', 'hospital_report_r5.json');
  cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null;
  return cache;
}

export async function GET(request) {
  const d = load();
  if (!d) return NextResponse.json({ ready: false });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const self = code ? d.areas[code] : null;
  if (!self) return NextResponse.json({ ready: true, source: d.source });
  const prefCode = code.slice(0, 2);
  const sibs = Object.entries(d.areas).filter(([c]) => c.slice(0, 2) === prefCode)
    .sort((a, b) => a[0].localeCompare(b[0])).map(([c, a]) => ({ code: c, ...a }));
  return NextResponse.json({
    ready: true, source: d.source, note: d.note, years: d.years, code,
    pref: self.pref, self, siblings: sibs,
    prefRow: d.prefs[prefCode] || null, national: d.national,
  });
}
