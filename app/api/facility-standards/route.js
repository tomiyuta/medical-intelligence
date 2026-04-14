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
  if (pref) data = data.filter(d => d.pref === pref);
  return NextResponse.json({ total: data.length, data });
}
