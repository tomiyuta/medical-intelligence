export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { getNdbPrescriptions } from '../../../../lib/data.js';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  let data = getNdbPrescriptions();
  if (pref) data = data.filter(d => d.pref === pref);
  return NextResponse.json(data, { headers: CACHE_HEADERS });
}
