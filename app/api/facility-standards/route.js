export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let cache = null;
function loadCompact() {
  if (!cache) cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'facility_standards_compact.json'), 'utf-8'));
  return cache;
}
let summaryCache = null;
function loadSummary() {
  if (!summaryCache) summaryCache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'facility_standards_summary.json'), 'utf-8'));
  return summaryCache;
}

const CAT_LABELS = {
  imaging:'画像診断',surgery:'手術',acute:'急性期/救急',rehab:'リハビリ',
  homecare:'在宅医療',oncology:'がん',psychiatry:'精神',pediatric:'小児/周産期',
  infection:'感染対策',dx_it:'DX/IT'
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const summary = searchParams.get('summary');
  const cap = searchParams.get('capability');
  if (summary === 'true') return NextResponse.json({...loadSummary(), categories: CAT_LABELS});
  let data = loadCompact();
  if (pref) data = data.filter(d => d.p === pref);
  if (cap) data = data.filter(d => d.cap && d.cap[cap] > 0);
  const normalized = data.map(d => ({
    code: d.c, name: d.m, pref: d.p, std_count: d.n,
    addr: d.a || '', zip: d.z || '', beds: d.b || null, beds_text: d.bt || '',
    cases: d.cs || null, los: d.los || null, score: d.sc || null, tier: d.t || '',
    caps: d.cap || {},
  }));
  return NextResponse.json({ total: normalized.length, data: normalized });
}
