export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 診療科別 従事医師数(令和6年三師統計 第25表)。65歳以上人口10万対で圏 vs 全国。
// カルテ#13対応だがベンダーは独自の医師配置を使用しており独自集計扱い。
let cache = null;
function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'data', 'static', 'physician_specialty_r6.json');
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
  return NextResponse.json({ ready: true, source: d.source, note: d.note, code, self, national: d.national });
}
