export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getMunicipalities } from '../../../lib/data.js';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const q = searchParams.get('q');
  const sort = searchParams.get('sort') || 'pop';
  const limit = Math.min(parseInt(searchParams.get('limit') || '80'), 200);
  let data = getMunicipalities();
  if (pref) data = data.filter(m => m.pref === pref);
  if (q) data = data.filter(m => m.name.includes(q) || m.pref.includes(q));
  data.sort((a,b) => (b[sort]||0) - (a[sort]||0));
  return NextResponse.json({ total: data.length, data: data.slice(0, limit) });
}
