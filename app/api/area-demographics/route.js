export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getAreaDemographics } from '../../../lib/data.js';
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pref = searchParams.get('prefecture');
  const area = searchParams.get('area');
  let data = getAreaDemographics();
  if (pref) data = data.filter(a => a.pref === pref);
  if (area) data = data.filter(a => a.area === area);
  const prefList = [...new Set(getAreaDemographics().map(a => a.pref))];
  return NextResponse.json({ total: data.length, prefectures: prefList, data });
}
