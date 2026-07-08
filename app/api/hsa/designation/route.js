export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 医療機関の指定状況(カルテ#7)。各種指定一覧を二次医療圏へ割当。
let cache = null;
function load() {
  if (cache) return cache;
  const path = join(process.cwd(), 'data', 'static', 'designation_r7.json');
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
  return NextResponse.json({ ready: true, source: d.source, note: d.note, labels: d.labels, order: d.order, code, ...self });
}
