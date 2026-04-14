export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getFacilityStandards, getFacilityStandardsSummary } from '../../../lib/data.js';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const summary = searchParams.get('summary');
  if (summary === 'true') return NextResponse.json(getFacilityStandardsSummary());
  let data = getFacilityStandards();
  if (pref) data = data.filter(d => d.pref === pref);
  // Return compact: facility list with standard count (not full standard details)
  const compact = data.map(d => ({
    code: d.code, name: d.name, pref: d.pref, addr: d.addr, beds: d.beds,
    std_count: d.standards.length,
    standards: d.standards.slice(0, 5).map(s => s.name), // top 5 only in list
  }));
  return NextResponse.json({ total: compact.length, data: compact });
}
