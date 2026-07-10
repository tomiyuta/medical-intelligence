export const revalidate = 86400;
import { NextResponse } from 'next/server';
import { getMedicalAreas } from '../../../lib/data.js';
const CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  let data = getMedicalAreas();
  if (pref) data = data.filter(a => a.pref === pref);
  const prefList = [...new Set(getMedicalAreas().map(a => a.pref))].sort();
  return NextResponse.json({ total: data.length, prefectures: prefList, data }, { headers: CACHE_HEADERS });
}
