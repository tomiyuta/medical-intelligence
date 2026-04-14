export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getFacilitiesGeo } from '../../../lib/data.js';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  let data = getFacilitiesGeo();
  if (pref) data = data.filter(f => f.pref === pref);
  return NextResponse.json({ total: data.length, data });
}
