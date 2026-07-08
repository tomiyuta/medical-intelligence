export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// R6病床機能報告 様式1 から再構築した二次医療圏×医療機関の病床機能・病床数。
// ?code=2606 で当該圏域の施設リストを返す。医療需給総覧PDFと同一年次(R6)・数値一致検証済み。
let cache = null;
function load() {
  const path = join(process.cwd(), 'data', 'static', 'bed_detail_r6.json');
  if (!existsSync(path)) return null;
  if (!cache) cache = JSON.parse(readFileSync(path, 'utf-8'));
  return cache;
}

// 構想区域別 病床機能推移・2025必要病床数（カルテ #19）
let necCache = null;
function loadNecessity() {
  if (necCache !== null) return necCache;
  const path = join(process.cwd(), 'data', 'static', 'bed_necessity_r6.json');
  necCache = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : {};
  return necCache;
}

export async function GET(request) {
  const data = load();
  if (!data) return NextResponse.json({ ready: false, area: null });
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.json({ ready: true, source: data.source, published: data.published, areaCount: data.areaCount });
  }
  const area = data.areas[code] || null;
  // 圏域レベルの入院料別 病床数（PDF #21 相当）を施設から集計
  let admFees = null;
  if (area) {
    const agg = {};
    for (const f of area.facilities) {
      for (const [fee, beds] of Object.entries(f.admFees || {})) {
        agg[fee] = (agg[fee] || 0) + beds;
      }
    }
    admFees = Object.entries(agg).map(([fee, beds]) => ({ fee, beds })).sort((a, b) => b.beds - a.beds);
  }
  const nec = loadNecessity();
  const necessity = (nec.areas && nec.areas[code]) || null;
  return NextResponse.json({ ready: true, source: data.source, published: data.published, note: data.note, code, area, admFees, necessity, necessitySource: nec.source });
}
