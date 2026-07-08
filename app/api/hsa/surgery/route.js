export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 手術件数の将来推計(発生率法・カルテ#44/#45)。NDB K手術×社人研人口。
let cache = null;
function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'data', 'static', 'surgery_projection_r5.json');
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
  return NextResponse.json({ ready: true, source: d.source, note: d.note, code, ...self });
}
