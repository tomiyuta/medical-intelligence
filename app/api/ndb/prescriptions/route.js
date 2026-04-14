export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getNdbPrescriptions } from '../../../../lib/data.js';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  let data = getNdbPrescriptions();
  if (pref) data = data.filter(d => d.pref === pref);
  return NextResponse.json(data);
}
