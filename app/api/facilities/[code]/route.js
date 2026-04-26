export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getTopFacilities } from '../../../../lib/data.js';
export async function GET(request, { params }) {
  const raw = getTopFacilities();
  const arr = Array.isArray(raw) ? raw : (raw?.data || []);
  const f = arr.find(x => x.facility_code_10 === params.code);
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(f);
}
