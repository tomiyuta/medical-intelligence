export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getTopFacilities } from '../../../lib/data.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tier = searchParams.get('tier');
  const prefecture = searchParams.get('prefecture');
  const q = searchParams.get('q');
  const minBeds = parseInt(searchParams.get('min_beds') || '0');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  let data = getTopFacilities();
  if (Array.isArray(data)) { /* already array */ }
  else if (data?.data) { data = data.data; }
  else { data = []; }
  if (tier) data = data.filter(f => f.tier === tier);
  if (prefecture) data = data.filter(f => f.prefecture_name === prefecture);
  if (q) data = data.filter(f => f.facility_name.includes(q));
  if (minBeds > 0) data = data.filter(f => (f.total_beds || 0) >= minBeds);

  const total = data.length;
  const sliced = data.slice(offset, offset + limit);
  return NextResponse.json({ total, limit, offset, data: sliced });
}
