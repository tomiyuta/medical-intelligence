export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { getTopFacilities } from '../../../../lib/data.js';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET(request, { params }) {
  const raw = getTopFacilities();
  const arr = Array.isArray(raw) ? raw : (raw?.data || []);
  const f = arr.find(x => x.facility_code_10 === params.code);
  if (!f) return NextResponse.json({ error: 'Not found' }, { headers: CACHE_HEADERS, status: 404 });
  return NextResponse.json(f, { headers: CACHE_HEADERS });
}
