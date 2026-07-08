export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// R6病床機能報告 施設票 由来の救急・医療機器データ。?code=2606 で当該圏の病院リストを返す。
// カルテ #57,58(救急車受入病院の概要)/#60,61(救急車受入件数) と数値一致検証済み。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'emergency_r6.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

export async function GET(request) {
  const data = load();
  if (!data) return NextResponse.json({ ready: false, area: null });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return NextResponse.json({ ready: true, source: data.source, published: data.published, areaCount: data.areaCount });
  const area = data.areas[code] || null;
  return NextResponse.json({ ready: true, source: data.source, published: data.published, note: data.note, code, area });
}
