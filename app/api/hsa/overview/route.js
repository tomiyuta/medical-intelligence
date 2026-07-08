export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 二次医療圏の概況(#4): 人口・面積・人口密度を都道府県内比較で返す。
let cache = null;
function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'data', 'static', 'area_overview.json');
  cache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null;
  return cache;
}

export async function GET(request) {
  const data = load();
  if (!data) return NextResponse.json({ ready: false });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const self = data.areas[code];
  if (!code || !self) return NextResponse.json({ ready: true, source: data.source });
  const pref = data.prefs[self.pref] || null;
  return NextResponse.json({
    ready: true, source: data.source, note: data.note, facSource: data.facSource, staffSource: data.staffSource,
    code, pref: self.pref, self,
    prefAreas: pref?.areas || [], prefTotal: pref?.total || null,
    national: data.national,
  });
}
