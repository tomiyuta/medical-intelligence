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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const summary = searchParams.get('summary');
  if (summary === 'true') return NextResponse.json(loadSummary());
  let data = loadCompact();
  if (pref) data = data.filter(d => d.p === pref);
  const normalized = data.map(d => ({
    code: d.c, name: d.m, pref: d.p, std_count: d.n,
    addr: d.a || '', zip: d.z || '', beds: d.b || null, beds_text: d.bt || '',
    cases: d.cs || null, los: d.los || null, score: d.sc || null, tier: d.t || '',
  }));
  return NextResponse.json({ total: normalized.length, data: normalized });
}
