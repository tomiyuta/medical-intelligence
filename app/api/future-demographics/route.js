export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

let cache = null;
function load() {
  if (!cache) cache = JSON.parse(readFileSync(join(process.cwd(), 'data', 'static', 'future_demographics.json'), 'utf-8'));
  return cache;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const data = load();

  if (pref) {
    const munis = data.municipalities.filter(m => m.pref === pref);
    return NextResponse.json({ prefecture: pref, count: munis.length, data: munis });
  }

  // Return all years for client-side year switching
  const prefSummary = data.prefectures.map(p => ({
    pref: p.pref,
    code: p.code,
    aging_rate_65: p.aging_rate_65 || {},
    aging_rate_75: p.aging_rate_75 || {},
    total_pop: p.total_pop || {},
  }));

  return NextResponse.json({
    years: data.years,
    source: data.source,
    prefectures: prefSummary,
  });
}
